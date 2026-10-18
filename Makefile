.PHONY: setup start stop dev test import-notes
setup:
	./scripts/setup.sh
start:
	./scripts/start.sh
stop:
	./scripts/stop.sh
dev:
	./scripts/dev.sh
test:
	.venv/bin/python scripts/check_content.py
	.venv/bin/python scripts/test_import_notes.py
	.venv/bin/python scripts/test_catalog.py
	.venv/bin/python -m pytest backend/tests -q
	npm --prefix frontend test
	npm --prefix browser-extension test
	npm --prefix frontend run build
import-notes:
	.venv/bin/python scripts/import_notes.py
