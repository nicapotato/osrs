# osrs.nicapotato.com

Static Old School RuneScape tools. GitHub Pages serves the repo root.

`CNAME` targets `osrs.nicapotato.com`. At the registrar, add a CNAME from `osrs` → `nicapotato.github.io` (same pattern as shaders / rocknroller). `www.nicapotato.com/osrs/` will not work — that path is the personal site, not this repo.

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/sotetseg/` | Maze trainer (`index.html`, `sotetseg.js`, `style.css`) |
| `/mmg/` | Money maker rankings, calculator, and character lookup (Vite build) |
| `/mmg/c` | Character page (Wise Old Man) |

## Sotetseg maze trainer

Copied from [deon9718/deon9718.github.io](https://github.com/deon9718/deon9718.github.io) (`osrs/sotetseg`). MIT — see `LICENSE`.

## Money makers

React + Vite app in `mmg-app/`. Production output is committed to `mmg/` so GitHub Pages can serve it without CI. Deep links (`/mmg/c`, `/mmg/m/:id`) use root `404.html` (a copy of the MMG index).

Live data comes from the public S3 prefix `prod-public-mindtricks-data` (`osrs-mmg.duckdb`). The bucket CORS allow-list must include `https://osrs.nicapotato.com` (see `fullstack-ai-app` `terraform/deploy/public-software-s3/env/prod.tfvars`).

After you change `mmg-app/`, run `make build` and commit `mmg/` plus root `404.html`. GitHub Pages has no build step.

`make serve` is a plain static server: `/mmg/c` and `/mmg/m/:id` 404 locally. Use `make dev` for those routes, or rely on GitHub Pages `404.html` in production. Local `make serve` also cannot fetch S3 (localhost is not a CORS origin) — `make dev` uses `data/osrs-mmg/` instead.

## Local

| Command | Description |
|--------|-------------|
| `make serve` | Serve repo root on `http://127.0.0.1:8882/` |
| `PORT=3000 make serve` | Another port |
| `make kill-port` | Free port 8882 |
| `make install` | Install MMG app dependencies (bun) |
| `make dev` | Vite MMG app on `http://127.0.0.1:5174/` |
| `make build` | Write `mmg/` + root `404.html` |
| `make import-osrs-db` | Download DuckDB + manifest into gitignored `data/osrs-mmg/` |
| `make download-osrs-skill-icons` | Fetch skill icons into `mmg-app/public/osrs-assets/` |

`make serve` needs **Python 3**. `make dev` / `make build` need **Bun**.
