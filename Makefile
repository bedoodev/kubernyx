WAILS := $(shell which wails 2>/dev/null || echo $(HOME)/go/bin/wails)
CLEAN_TARGETS := build/bin frontend/dist
CLEAN_GLOBS := $(CLEAN_TARGETS) frontend/node_modules.corrupt.* frontend/node_modules.__deleting.*

.PHONY: dev build clean clean-sync clean-deps repair-node-modules

dev: repair-node-modules
	$(WAILS) dev

build:
	$(WAILS) build

clean:
	@set -eu; \
	for dir in $(CLEAN_GLOBS); do \
		[ -e "$$dir" ] || continue; \
		tombstone="$$dir.__deleting.$$(date +%s).$$$$"; \
		if mv "$$dir" "$$tombstone" 2>/dev/null; then \
			(rm -rf "$$tombstone" >/dev/null 2>&1 &) || true; \
			echo "scheduled async delete: $$dir"; \
		else \
			rm -rf "$$dir"; \
		fi; \
	done

clean-sync:
	rm -rf $(CLEAN_GLOBS)

clean-deps:
	rm -rf frontend/node_modules frontend/node_modules.corrupt.* frontend/node_modules.__deleting.*

repair-node-modules:
	@set -eu; \
	if [ ! -d frontend/node_modules ]; then \
		exit 0; \
	fi; \
	dup="$$(find frontend/node_modules -mindepth 1 -maxdepth 1 -name '* [0-9]' -print -quit 2>/dev/null || true)"; \
	if [ -n "$$dup" ]; then \
		quarantine="frontend/node_modules.corrupt.$$(date +%Y%m%d%H%M%S)"; \
		echo "detected suspicious node_modules entries, moving to $$quarantine"; \
		mv frontend/node_modules "$$quarantine"; \
	fi
