.PHONY: install web web-build web-preview web-typecheck api api-build api-test format format-check

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

api:
	npm run dev:api

api-build:
	npm run build:api

api-test:
	npm --workspace @chart/api run test

format:
	npm run format

format-check:
	npm run format:check
