.PHONY: install web web-build web-preview web-typecheck

install:
	npm install

web:
	npm run dev:web -- --host 127.0.0.1 --port 5173

web-build:
	npm run build:web

web-preview:
	npm --workspace @chart/web run preview -- --host 127.0.0.1 --port 4173

web-typecheck:
	npm --workspace @chart/web run typecheck
