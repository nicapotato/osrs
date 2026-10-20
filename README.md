# osrs.nicapotato.com

Static Old School RuneScape tools. GitHub Pages serves the repo root.

`CNAME` targets `osrs.nicapotato.com`. At the registrar, add a CNAME from `osrs` → `nicapotato.github.io` (same pattern as shaders / rocknroller). `www.nicapotato.com/osrs/` will not work — that path is the personal site, not this repo.

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/sotetseg/` | Maze trainer (`index.html`, `sotetseg.js`, `style.css`) |
| `/mmg/` | Money maker rankings, calculator, and character lookup (Vite build) |
| `/mmg/c` | Character page (Wise Old Man) |
| `/quests/` | Quest / skill dependency graph |
| `/quests/network/` | Full quest force-layout map |
| `/skills/` | Skill unlock timeline (willow at 30, etc.) |
| `/skills/network/` | Cross-skill method network |

## Sotetseg maze trainer

Copied from [deon9718/deon9718.github.io](https://github.com/deon9718/deon9718.github.io) (`osrs/sotetseg`). MIT — see `LICENSE`.

## Money makers

React + Vite app in `mmg-app/`. Production output is committed to `mmg/` (scripts + money-maker pages), `quests/index.html`, and `skills/index.html` (same SPA). Deep links (`/mmg/c`, `/mmg/m/:id`, `/quests/:id`, `/skills/:id`) use root `404.html`.

Live data comes from the public S3 prefix `prod-public-mindtricks-data` (`osrs-mmg.duckdb`). The bucket CORS allow-list must include `https://osrs.nicapotato.com` (see `fullstack-ai-app` `terraform/deploy/public-software-s3/env/prod.tfvars`).

After you change `mmg-app/`, run `make build` and commit `mmg/`, `quests/`, `skills/`, and root `404.html`. GitHub Pages has no build step.

## Skill method graph

Static graph built from [Module:Skill calc](https://oldschool.runescape.wiki/w/Module:Skill_calc), `{Skill}/Level up table` pages, and the wiki Bucket `recipe` store. `make build-skill-graph` writes `mmg-app/public/osrs-skills/graph.json`. Timeline view is the in-game skill-guide unlocks; the network view highlights methods that touch two or more skills (item feeds plus multi-skill recipes). Wise Old Man overlays locked vs ready.

Wiki content is CC BY-NC-SA 3.0.

## Quest graph

Static graph built from [Module:Questreq/data](https://oldschool.runescape.wiki/w/Module:Questreq/data) and [Quests/List](https://oldschool.runescape.wiki/w/Quests/List). `make build-quest-graph` writes `mmg-app/public/osrs-quests/graph.json`. Wise Old Man overlays skill gates; quest completion is a local checklist (WikiSync is not used).

Wiki content is CC BY-NC-SA 3.0.

`make serve` is a plain static server: `/mmg/c`, `/mmg/m/:id`, `/quests/:id`, and `/skills/:id` 404 locally. Use `make dev` for those routes, or rely on GitHub Pages `404.html` in production. Local `make serve` also cannot fetch S3 (localhost is not a CORS origin) — `make dev` uses `data/osrs-mmg/` instead.

`make dev` serves the SPA at `http://127.0.0.1:5174/mmg`, `http://127.0.0.1:5174/quests`, and `http://127.0.0.1:5174/skills`.

## Local

| Command | Description |
|--------|-------------|
| `make serve` | Serve repo root on `http://127.0.0.1:8883/` |
| `PORT=3000 make serve` | Another port |
| `make kill-port` | Free port 8883 |
| `make install` | Install MMG app dependencies (bun) |
| `make dev` | Vite MMG app on `http://127.0.0.1:5174/` |
| `make build` | Write `mmg/` + `quests/` + `skills/` + root `404.html` |
| `make import-osrs-db` | Download DuckDB + manifest into gitignored `data/osrs-mmg/` |
| `make download-osrs-skill-icons` | Fetch skill icons into `mmg-app/public/osrs-assets/` |
| `make build-quest-graph` | Refresh quest `graph.json` from the OSRS Wiki |
| `make build-skill-graph` | Refresh skill `graph.json` from the OSRS Wiki |

`make serve` needs **Python 3**. `make dev` / `make build` need **Bun**.
