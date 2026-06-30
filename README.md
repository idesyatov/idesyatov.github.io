# idesyatov.github.io

Personal static site styled as a terminal window in the **Tokyo Night** palette.
Plain HTML/CSS + a little vanilla JS — no build step, no framework, no backend,
no API token.

<p>
  <img alt="website" src="https://img.shields.io/website?url=https%3A%2F%2Fidesyatov.github.io&style=flat-square&up_message=online&down_message=offline">
  <img alt="refresh-stats" src="https://img.shields.io/github/actions/workflow/status/idesyatov/idesyatov.github.io/refresh-stats.yml?style=flat-square&label=stats%20refresh">
  <img alt="last commit" src="https://img.shields.io/github/last-commit/idesyatov/idesyatov.github.io?style=flat-square">
  <img alt="license" src="https://img.shields.io/github/license/idesyatov/idesyatov.github.io?style=flat-square">
  <img alt="no build" src="https://img.shields.io/badge/build-none-9ece6a?style=flat-square">
</p>

Live: **https://idesyatov.github.io**

## What it is

A single-page site that renders like a terminal. It pulls public GitHub data at
runtime and degrades gracefully when the API is unavailable — the page never
breaks, it just falls back to a snapshot.

- **Hero / neofetch** — profile card with live followers and repo counts.
- **Projects** — repository cards fetched live from the public GitHub API.
- **Stack & languages** — technology tags and language shares.
- **Interactive terminal** — type commands right on the page:
  `help`, `whoami`, `stars`, `news`, `activity`, `theme`, `contact`, `clear`,
  with command history (`↑`/`↓`) and `Tab` autocomplete. Start typing anywhere
  to focus it.
- **Themes** — switch the color scheme via `theme <name>` (Tokyo Night,
  Gruvbox, Dracula); the choice is saved in `localStorage`.

## How it works

Heavy aggregates would burn the unauthenticated API limit (60 req/h per IP), so
they are **not** computed in the browser. Data comes from two places:

- **Live** — fetched in the browser from the public GitHub API (a couple of
  requests, cached 45 min in `localStorage`). Profile, repositories, stars,
  activity, plus a few public sources for the `news`/`whoami` commands.
- **Snapshot** — `stats.json`, the heavy metrics (language %, code size,
  commits, PRs). Regenerated daily by a GitHub Action; nothing is computed
  client-side.

No token is ever embedded (it would become public) — only unauthenticated
public requests are made.

## Structure

```
index.html        # markup: hero, projects, stack, mini-terminal
assets/style.css  # Tokyo Night tokens + alternate themes, responsive, accessible
assets/main.js    # live GitHub data + cache + interactive terminal
stats.json        # snapshot of heavy metrics (the only data file)
.nojekyll         # serve files as-is (skip Jekyll)
```

For the full data flow — where every number comes from and how the snapshot
updates — see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Notes

- Single web font (JetBrains Mono) with `monospace` fallback; `font-display: swap`.
- Skip link, semantic landmarks, `aria-live` for async regions, focus-visible.
- `prefers-reduced-motion` disables the blinking cursor and shimmer.
- No render-blocking JS (`defer`); no external JS dependencies.

## License

[MIT](LICENSE)
