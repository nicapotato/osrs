.PHONY: help install dev build preview serve kill-port import-osrs-db download-osrs-skill-icons

PORT ?= 8883
MMG_APP := mmg-app
OSRS_DATA_DIR := data/osrs-mmg
OSRS_S3_PREFIX ?= s3://prod-public-mindtricks-data/prod/client/osrs-mmg
OSRS_ASSETS_DIR := $(MMG_APP)/public/osrs-assets
OSRS_WIKI_IMAGES := https://oldschool.runescape.wiki/images
OSRS_SKILL_NAMES := Agility Attack Construction Cooking Crafting Defence Farming Firemaking Fishing Fletching Herblore Hitpoints Hunter Magic Mining Prayer Ranged Runecraft Slayer Smithing Strength Thieving Woodcutting

help: ## Show targets
	@echo "osrs — GitHub Pages (HTML landing + sotetseg; Vite app in mmg/)"
	@echo "  make serve              serve repo root at http://127.0.0.1:$(PORT)/"
	@echo "  PORT=3000 make serve    use another port"
	@echo "  make kill-port          free port $(PORT)"
	@echo "  make install            bun install in mmg-app/"
	@echo "  make dev                Vite MMG app at http://127.0.0.1:5174/"
	@echo "  make build              production MMG → mmg/ (+ root 404.html)"
	@echo "  make preview            preview production MMG build"
	@echo "  make import-osrs-db     download DuckDB + manifest into data/osrs-mmg/"
	@echo "  make download-osrs-skill-icons  fetch skill icons into mmg-app/public/"
	@echo ""
	@echo "  http://127.0.0.1:$(PORT)/                 landing"
	@echo "  http://127.0.0.1:$(PORT)/sotetseg/        sotetseg maze trainer"
	@echo "  http://127.0.0.1:$(PORT)/mmg/             money makers (after make build)"

install: ## Install MMG app dependencies (bun)
	cd $(MMG_APP) && bun install

dev: ## Vite dev server for MMG (loads .env.dev)
	cd $(MMG_APP) && bun run dev

build: ## Production MMG build → mmg/; loads .env.prod
	cd $(MMG_APP) && bun run build
	cp mmg/index.html mmg/404.html
	cp mmg/index.html 404.html

preview: ## Preview production MMG build
	cd $(MMG_APP) && bun run preview

kill-port:
	lsof -t -i :${PORT} | xargs kill -9

serve: ## Local HTTP server for repo root; open http://127.0.0.1:8883/
	@echo "Serving . on http://127.0.0.1:$(PORT)/"
	@echo "  sotetseg: http://127.0.0.1:$(PORT)/sotetseg/"
	@echo "  mmg:      http://127.0.0.1:$(PORT)/mmg/"
	python3 -m http.server $(PORT) --bind 127.0.0.1

import-osrs-db: ## Download OSRS DuckDB + manifest into gitignored data/osrs-mmg/
	@mkdir -p $(OSRS_DATA_DIR)
	aws s3 cp $(OSRS_S3_PREFIX)/osrs-mmg.duckdb $(OSRS_DATA_DIR)/
	aws s3 cp $(OSRS_S3_PREFIX)/manifest.json $(OSRS_DATA_DIR)/

download-osrs-skill-icons: ## Fetch 25x25 skill icons into mmg-app/public/osrs-assets/
	@mkdir -p $(OSRS_ASSETS_DIR)
	@for skill in $(OSRS_SKILL_NAMES); do \
		curl -fsSL "$(OSRS_WIKI_IMAGES)/$${skill}_icon.png" -o "$(OSRS_ASSETS_DIR)/$$(echo $$skill | tr '[:upper:]' '[:lower:]')-icon.png"; \
	done
	@curl -fsSL "$(OSRS_WIKI_IMAGES)/Sailing.png" -o "$(OSRS_ASSETS_DIR)/sailing.png"
