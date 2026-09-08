# Forward to the osrs repo makefile so `make serve-vite` works from mmg-app/.
OSRS_ROOT := ..

.PHONY: help install dev serve-vite build preview serve serve-pages serve-sote kill-port kill-pages kill-vite import-osrs-db download-osrs-skill-icons build-quest-graph

help install dev serve-vite build preview serve serve-pages serve-sote kill-port kill-pages kill-vite import-osrs-db download-osrs-skill-icons build-quest-graph:
	@$(MAKE) -C $(OSRS_ROOT) $@
