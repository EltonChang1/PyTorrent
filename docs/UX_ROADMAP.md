# UX enrichment roadmap

Status: checklist below reflects the implemented pass (see repo history for details).

## Phase A — Playback and polish

- [x] Watch page: keyboard (Space, arrows, F fullscreen, M mute) and remembered volume (`localStorage`)
- [x] Toast actions: link to My downloads after adding a torrent
- [x] Job catalog snapshot on add → posters on Continue watching row

## Phase B — Discovery and home

- [x] Staggered row entrance animation + improved skeletons
- [x] Row empty states with Retry
- [x] Top 10 on YTS row (limit 10, ranked badges)
- [x] “More like your last watch” row (search from last resume title)
- [x] Three “Picked for you — {genre}” rows from favorite genres (replace single row)
- [x] My List: heart on cards + modal + home row; sync to `user_settings` when logged in
- [x] Dashboard: custom `rowOrder` (move up/down)

## Phase C — Onboarding and accessibility

- [x] First-run welcome modal (`localStorage` flag)
- [x] Title modal: focus trap and `aria-modal`
- [x] Respect `prefers-reduced-motion` (disable hero auto-rotate)

## Phase D — PWA and API hardening

- [x] Web app manifest + service worker (offline shell)
- [x] Basic rate limit on `/auth/login` and `/auth/register`

## Deferred (not in this pass)

- Skip intro / next episode (needs episode metadata)
- Read-only demo mode without daemon
- ML recommendations
