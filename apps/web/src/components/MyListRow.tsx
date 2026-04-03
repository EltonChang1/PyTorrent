import { useCallback, useEffect, useState } from "react";
import type { CatalogItem } from "../catalog/types";
import { getMyList, isInMyList, subscribeMyList, toggleMyList } from "../lib/myList";
import { ContentRow } from "./ContentRow";

type Props = {
  onSelect: (item: CatalogItem) => void;
  staggerIndex?: number;
};

export function MyListRow({ onSelect, staggerIndex = 0 }: Props) {
  const [items, setItems] = useState<CatalogItem[]>(() => getMyList());

  useEffect(() => subscribeMyList(() => setItems(getMyList())), []);

  const handleToggle = useCallback((item: CatalogItem) => {
    toggleMyList(item);
    setItems(getMyList());
  }, []);

  if (items.length === 0) return null;

  return (
    <ContentRow
      title="My List"
      rowKey="my-list"
      items={items}
      loading={false}
      onSelect={onSelect}
      staggerIndex={staggerIndex}
      myListEnabled
      isInMyList={isInMyList}
      onMyListToggle={handleToggle}
    />
  );
}
