import asyncio
import os
import re
import time
import aiohttp
from bs4 import BeautifulSoup
from helper.asyncioPoliciesFix import decorator_asyncio_fix
from helper.html_scraper import Scraper
from constants.base_url import YTS
from constants.headers import HEADER_AIO
from helper.poster_proxy import rewrite_browse_result_posters
from torrents import yts_api


def _yts_catalog_mode() -> str:
    """html (default) | json | auto. YTS_USE_HTML_ONLY=1 forces html."""
    if os.environ.get("YTS_USE_HTML_ONLY", "").strip().lower() in ("1", "true", "yes"):
        return "html"
    m = os.environ.get("YTS_CATALOG_MODE", "html").strip().lower()
    if m in ("html", "json", "auto"):
        return m
    return "html"


class Yts:
    _name = "YTS"

    def __init__(self):
        self.BASE_URL = YTS
        self.LIMIT = None

    @decorator_asyncio_fix
    async def _individual_scrap(self, session, url, obj):
        try:
            async with session.get(url, headers=HEADER_AIO) as res:
                html = await res.text(encoding="ISO-8859-1")
                soup = BeautifulSoup(html, "html.parser")
                try:
                    name = soup.select_one("div.hidden-xs h1").text
                    div = soup.select("div.hidden-xs h2")
                    date = div[0].text
                    genre = div[1].text.split("/")
                    rating = soup.select_one("[itemprop=ratingValue]").text
                    poster = (
                        soup.find("div", id="movie-poster")
                        .find("img")["src"]
                        .split("/")
                    )
                    poster[-1] = poster[-1].replace("medium", "large")
                    poster = "/".join(poster)
                    description = soup.select("div#synopsis > p")[0].text.strip()
                    runtime = (
                        soup.select_one(".tech-spec-info")
                        .find_all("div", class_="row")[-1]
                        .find_all("div")[-3]
                        .text.strip()
                    )

                    screenshots = soup.find_all("a", class_="screenshot-group")
                    screenshots = [a["href"] for a in screenshots]
                    torrents = []
                    for div in soup.find_all("div", class_="modal-torrent"):
                        quality = (
                            div.find("div", class_="modal-quality").find("span").text
                        )
                        all_p = div.find_all("p", class_="quality-size")
                        quality_type = all_p[0].text
                        size = all_p[1].text
                        torrent_link = div.find("a", class_="download-torrent")["href"]
                        magnet = div.find("a", class_="magnet-download")["href"]
                        hash = re.search(r"([{a-f\d,A-F\d}]{32,40})\b", magnet).group(0)
                        torrents.append(
                            {
                                "quality": quality,
                                "type": quality_type,
                                "size": size,
                                "torrent": torrent_link,
                                "magnet": magnet,
                                "hash": hash,
                            }
                        )
                    obj["name"] = name
                    obj["date"] = date
                    obj["genre"] = genre
                    obj["rating"] = rating
                    obj["poster"] = poster
                    obj["description"] = description
                    obj["runtime"] = runtime
                    obj["screenshot"] = screenshots
                    picked = yts_api.pick_preferred_yts_torrent(torrents)
                    if picked:
                        pm = picked.get("magnet")
                        if isinstance(pm, str) and pm.startswith("magnet:"):
                            obj["magnet"] = pm
                        else:
                            h = picked.get("hash")
                            if h:
                                obj["magnet"] = yts_api.build_yts_magnet(name, h)
                        obj["size"] = picked.get("size")
                        obj["seeders"] = str(picked.get("seeds", ""))
                        obj["leechers"] = str(picked.get("peers", ""))
                    obj["torrents"] = yts_api.normalized_yts_torrent_options(name, torrents)
                except Exception:
                    ...
        except Exception:
            return None

    async def _get_torrent(self, result, session, urls):
        tasks = []
        for idx, url in enumerate(urls):
            for obj in result["data"]:
                if obj["url"] == url:
                    task = asyncio.create_task(
                        self._individual_scrap(session, url, result["data"][idx])
                    )
                    tasks.append(task)
        await asyncio.gather(*tasks)
        return result

    def _parser(self, htmls):
        try:
            for html in htmls:
                soup = BeautifulSoup(html, "html.parser")
                list_of_urls = []
                my_dict = {"data": []}
                for div in soup.find_all("div", class_="browse-movie-wrap"):
                    url = div.find("a")["href"]
                    list_of_urls.append(url)
                    my_dict["data"].append({"url": url})
                    if len(my_dict["data"]) == self.LIMIT:
                        break
                try:
                    ul = soup.find("ul", class_="tsc_pagination")
                    current_page = ul.find("a", class_="current").text
                    my_dict["current_page"] = int(current_page)
                    if current_page:
                        total_results = soup.select_one(
                            "body > div.main-content > div.browse-content > div > h2 > b"
                        ).text
                        if "," in total_results:
                            total_results = total_results.replace(",", "")
                        total_page = int(total_results) / 20
                        my_dict["total_pages"] = (
                            int(total_page) + 1
                            if type(total_page) == float
                            else int(total_page)
                        )

                except Exception:
                    ...
                return my_dict, list_of_urls
        except Exception:
            return None, None

    async def _html_parser_result(self, start_time, url, session):
        htmls = await Scraper().get_all_results(session, url)
        result, urls = self._parser(htmls)
        if result is not None:
            results = await self._get_torrent(result, session, urls)
            results["time"] = time.time() - start_time
            results["total"] = len(results["data"])
            return results
        return result

    async def search(self, query, page, limit):
        self.LIMIT = limit
        start_time = time.time()
        mode = _yts_catalog_mode()
        if mode in ("json", "auto"):
            async with aiohttp.ClientSession(trust_env=True) as session:
                raw = await yts_api.fetch_list_movies_json(
                    session,
                    page=page,
                    limit=limit,
                    query_term=query,
                    sort_by="date_added",
                    order_by="desc",
                )
            if mode == "json":
                if raw is None:
                    return None
                return yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
            if raw is not None:
                out = yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
                if len(out.get("data") or []) > 0:
                    return out
        async with aiohttp.ClientSession() as session:
            if page != 1:
                url = (
                    self.BASE_URL
                    + "/browse-movies/{}/all/all/0/latest/0/all?page={}".format(
                        query, page
                    )
                )
            else:
                url = self.BASE_URL + "/browse-movies/{}/all/all/0/latest/0/all".format(
                    query
                )
            res = await self._html_parser_result(start_time, url, session)
            if res is not None:
                rewrite_browse_result_posters(res, YTS)
            return res

    async def trending(self, category, page, limit):
        self.LIMIT = limit
        start_time = time.time()
        mode = _yts_catalog_mode()
        if mode in ("json", "auto"):
            async with aiohttp.ClientSession(trust_env=True) as session:
                raw = await yts_api.fetch_list_movies_json(
                    session,
                    page=page,
                    limit=limit,
                    sort_by="download_count",
                    order_by="desc",
                )
            if mode == "json":
                if raw is None:
                    return None
                return yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
            if raw is not None:
                out = yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
                if len(out.get("data") or []) > 0:
                    return out
        async with aiohttp.ClientSession() as session:
            url = self.BASE_URL + "/trending-movies"
            res = await self._html_parser_result(start_time, url, session)
            if res is not None:
                rewrite_browse_result_posters(res, YTS)
            return res

    async def recent(self, category, page, limit):
        self.LIMIT = limit
        start_time = time.time()
        mode = _yts_catalog_mode()
        if mode in ("json", "auto"):
            async with aiohttp.ClientSession(trust_env=True) as session:
                raw = await yts_api.fetch_list_movies_json(
                    session,
                    page=page,
                    limit=limit,
                    sort_by="date_added",
                    order_by="desc",
                )
            if mode == "json":
                if raw is None:
                    return None
                return yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
            if raw is not None:
                out = yts_api.wrap_list_response(
                    raw, limit=limit, elapsed=time.time() - start_time
                )
                if len(out.get("data") or []) > 0:
                    return out
        async with aiohttp.ClientSession() as session:
            if page != 1:
                url = (
                    self.BASE_URL
                    + "/browse-movies/0/all/all/0/featured/0/all?page={}".format(page)
                )
            else:
                url = self.BASE_URL + "/browse-movies/0/all/all/0/featured/0/all"
            res = await self._html_parser_result(start_time, url, session)
            if res is not None:
                rewrite_browse_result_posters(res, YTS)
            return res
