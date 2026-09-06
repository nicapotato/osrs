# osrs.nicapotato.com

Static Old School RuneScape tools (plain HTML, CSS, and JavaScript). GitHub Pages serves the repo root.

`CNAME` targets `osrs.nicapotato.com`. At the registrar, add a CNAME from `osrs` → `nicapotato.github.io` (same pattern as shaders / rocknroller). `www.nicapotato.com/osrs/` will not work — that path is the personal site, not this repo.

## Sotetseg maze trainer

Copied from [deon9718/deon9718.github.io](https://github.com/deon9718/deon9718.github.io) (`osrs/sotetseg`). MIT — see `LICENSE`.

| Path | Description |
|------|-------------|
| `/` | Landing page (links to Sotetseg) |
| `/sotetseg/` | Maze trainer (`index.html`, `sotetseg.js`, `style.css`, `tornado.png`) |

## Local

| Command | Description |
|--------|-------------|
| `make serve` | Serve on `http://127.0.0.1:8882/` |
| `PORT=3000 make serve` | Another port |
| `make kill-port` | Free port 8882 |

Requires **Python 3**.
