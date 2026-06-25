# idesyatov.github.io

Personal static site — terminal window in **Tokyo Night** palette, matching the
profile card (`idesyatov/idesyatov`). Plain HTML/CSS + a little vanilla JS,
no build step, no framework, no backend.

Live: **https://idesyatov.github.io**

## Structure

```
index.html        # markup: hero (neofetch), projects, stack, contact, mini-terminal
assets/style.css  # Tokyo Night tokens, responsive, accessible
assets/main.js    # live GitHub data + cache + interactive terminal
stats.json        # snapshot of heavy metrics (languages %, commits, PRs)
.nojekyll         # serve files as-is (skip Jekyll processing)
```

## Data: what's live vs. snapshot

Heavy aggregates would burn the unauthenticated API limit (60 req/h per IP),
so they are **not** computed in the browser:

- **Snapshot** (`stats.json`): language percentages, code size, commits, PRs.
  Sourced from the profile's `terminal.svg`. Refresh manually, or wire a
  scheduled GitHub Action that regenerates it.
- **Live** (`assets/main.js`, max 2 requests, cached 45 min in `localStorage`):
  - profile — `GET /users/idesyatov` (followers, public repos)
  - repos — `GET /users/idesyatov/repos?sort=pushed&per_page=100` (project cards)

If the API is unavailable or rate-limited, the page falls back to the snapshot
and a tidy placeholder — it never breaks. No token is ever embedded (it would
become public); only unauthenticated public requests are made.

## Run locally

Any static server works (needed so `fetch()` of `stats.json` isn't blocked by
`file://`):

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Open http://localhost:8000

## Deploy (GitHub Pages)

This is a **user site**, so the repo must be named exactly `idesyatov.github.io`.

1. Push to the default branch (`main` or `master`).
2. **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**,
   branch = default, folder = `/ (root)`.
3. Wait ~1 min — the site is served at `https://idesyatov.github.io` over HTTPS
   (issued automatically).

### Custom domain (optional)

Add a `CNAME` file containing the domain (e.g. `desyatov.dev`), set the DNS
records GitHub shows, then enable **Enforce HTTPS** in Pages settings.

## Accessibility / performance notes

- Single web font (JetBrains Mono) with `monospace` fallback; `font-display: swap`.
- Skip link, semantic landmarks, `aria-live` for async regions, focus-visible.
- `prefers-reduced-motion` disables the blinking cursor and shimmer.
- No render-blocking JS (`defer`); no external JS dependencies.
