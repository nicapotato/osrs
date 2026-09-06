.PHONY: serve help kill-port

PORT ?= 8882

help: ## Show targets
	@echo "osrs — local static GitHub Pages"
	@echo "  make serve              serve at http://127.0.0.1:$(PORT)/"
	@echo "  PORT=3000 make serve    use another port"
	@echo "  make kill-port          free port $(PORT)"
	@echo ""
	@echo "  http://127.0.0.1:$(PORT)/                 index"
	@echo "  http://127.0.0.1:$(PORT)/sotetseg/        sotetseg maze trainer"

kill-port:
	lsof -t -i :${PORT} | xargs kill -9

serve: ## Local HTTP server; open http://127.0.0.1:8882/
	@echo "Serving . on http://127.0.0.1:$(PORT)/"
	@echo "  sotetseg: http://127.0.0.1:$(PORT)/sotetseg/"
	python3 -m http.server $(PORT) --bind 127.0.0.1
