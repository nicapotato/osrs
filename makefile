.PHONY: help install dev serve-vite build preview serve serve-pages serve-sote kill-port kill-pages kill-vite import-osrs-db download-osrs-skill-icons build-quest-graph

PAGES_PORT ?= 8883
PORT ?= $(PAGES_PORT)
VITE_PORT ?= 5174
MMG_APP := mmg-app
OSRS_DATA_DIR := data/osrs-mmg
OSRS_S3_PREFIX ?= s3://prod-public-mindtricks-data/prod/client/osrs-mmg
OSRS_ASSETS_DIR := $(MMG_APP)/public/osrs-assets
OSRS_WIKI_IMAGES := https://oldschool.runescape.wiki/images
OSRS_SKILL_NAMES := Agility Attack Construction Cooking Crafting Defence Farming Firemaking Fishing Fletching Herblore Hitpoints Hunter Magic Mining Prayer Ranged Runecraft Slayer Smithing Strength Thieving Woodcutting

help: ## Show targets
	@echo "osrs — GitHub Pages (HTML landing + sotetseg; Vite app in mmg/)"
	@echo "  make serve-pages        landing + sotetseg at http://127.0.0.1:$(PAGES_PORT)/"
	@echo "  make serve-sote         same static server (prints sotetseg URL)"
	@echo "  make serve-vite         Vite app at http://127.0.0.1:$(VITE_PORT)/ (mmg + quests)"
	@echo "  make serve              alias for serve-pages"
	@echo "  make dev                alias for serve-vite"
	@echo "  PAGES_PORT=3000 make serve-pages"
	@echo "  make kill-pages         free port $(PAGES_PORT)"
	@echo "  make kill-vite          free port $(VITE_PORT)"
	@echo "  make kill-port          free both local servers"
	@echo "  make install            bun install in mmg-app/"
	@echo "  make build              production SPA → mmg/ + quests/ (+ root 404.html)"
	@echo "  make preview            preview production MMG build"
	@echo "  make import-osrs-db     download DuckDB + manifest into data/osrs-mmg/"
	@echo "  make download-osrs-skill-icons  fetch skill icons into mmg-app/public/"
	@echo "  make build-quest-graph  fetch wiki Questreq + emit mmg-app/public/osrs-quests/graph.json"
	@echo ""
	@echo "  http://127.0.0.1:$(PAGES_PORT)/                 landing"
	@echo "  http://127.0.0.1:$(PAGES_PORT)/sotetseg/        sotetseg maze trainer"
	@echo "  http://127.0.0.1:$(VITE_PORT)/mmg               money makers (Vite)"
	@echo "  http://127.0.0.1:$(VITE_PORT)/quests            quest graph (Vite)"
	@echo "  http://127.0.0.1:$(PAGES_PORT)/mmg/             money makers (after make build)"
	@echo "  http://127.0.0.1:$(PAGES_PORT)/quests/          quest graph (after make build)"

install: ## Install MMG app dependencies (bun)
	cd $(MMG_APP) && bun install

serve-vite: ## Vite app for /mmg and /quests (loads .env.dev)
	@echo "Vite app on http://127.0.0.1:$(VITE_PORT)/"
	@echo "  mmg:    http://127.0.0.1:$(VITE_PORT)/mmg"
	@echo "  quests: http://127.0.0.1:$(VITE_PORT)/quests"
	cd $(MMG_APP) && bun run dev -- --port $(VITE_PORT) --strictPort

dev: serve-vite ## Alias for serve-vite

build: ## Production SPA → mmg/ + quests/; loads .env.prod
	cd $(MMG_APP) && bun run build
	mkdir -p quests
	cp mmg/index.html mmg/404.html
	cp mmg/index.html quests/index.html
	cp mmg/index.html quests/404.html
	cp mmg/index.html 404.html

preview: ## Preview production MMG build
	cd $(MMG_APP) && bun run preview

define kill_listen
	@pids=$$(lsof -t -i :$(1) 2>/dev/null); \
	if [ -n "$$pids" ]; then kill -9 $$pids; echo "freed :$(1)"; else echo "nothing on :$(1)"; fi
endef

kill-pages: ## Free the static HTML server port
	$(call kill_listen,$(PAGES_PORT))

kill-vite: ## Free the Vite app port
	$(call kill_listen,$(VITE_PORT))

kill-port: kill-pages kill-vite ## Free pages + Vite ports

serve-pages: ## Landing + sotetseg (static HTML at repo root)
	@echo "Static pages on http://127.0.0.1:$(PAGES_PORT)/"
	@echo "  landing:  http://127.0.0.1:$(PAGES_PORT)/"
	@echo "  sotetseg: http://127.0.0.1:$(PAGES_PORT)/sotetseg/"
	@echo "  mmg:      http://127.0.0.1:$(PAGES_PORT)/mmg/     (after make build)"
	@echo "  quests:   http://127.0.0.1:$(PAGES_PORT)/quests/  (after make build)"
	python3 -m http.server $(PAGES_PORT) --bind 127.0.0.1

serve-sote: serve-pages ## Alias for serve-pages (sotetseg lives at /sotetseg/)

serve: serve-pages ## Alias for serve-pages

import-osrs-db: ## Download OSRS DuckDB + manifest into gitignored data/osrs-mmg/
	@mkdir -p $(OSRS_DATA_DIR)
	aws s3 cp $(OSRS_S3_PREFIX)/osrs-mmg.duckdb $(OSRS_DATA_DIR)/
	aws s3 cp $(OSRS_S3_PREFIX)/manifest.json $(OSRS_DATA_DIR)/

build-quest-graph: ## Fetch OSRS Wiki Questreq + Quests/List and write graph.json
	python3 scripts/build_quest_graph.py

download-osrs-skill-icons: ## Fetch 25x25 skill icons into mmg-app/public/osrs-assets/
	@mkdir -p $(OSRS_ASSETS_DIR)
	@for skill in $(OSRS_SKILL_NAMES); do \
		curl -fsSL "$(OSRS_WIKI_IMAGES)/$${skill}_icon.png" -o "$(OSRS_ASSETS_DIR)/$$(echo $$skill | tr '[:upper:]' '[:lower:]')-icon.png"; \
	done
	@curl -fsSL "$(OSRS_WIKI_IMAGES)/Sailing.png" -o "$(OSRS_ASSETS_DIR)/sailing.png"
