CHART_SSH_HOST ?= chart
export CHART_SSH_HOST

ifeq ($(CHART_SERVICES),remote)
export CHART_WEB_ORIGIN ?= http://127.0.0.1:3100
endif

.PHONY: remote-connect remote-disconnect remote-status remote-services remote-check

remote-connect:
	bash infra/remote-dev/tunnel.sh connect

remote-disconnect:
	bash infra/remote-dev/tunnel.sh disconnect

remote-status:
	bash infra/remote-dev/tunnel.sh status

# The fixed directory and explicit project prevent touching the public sandbox.
remote-services:
	ssh -o BatchMode=yes -o ConnectTimeout=10 "$(CHART_SSH_HOST)" 'cd ~/chart-dev/infra/remote-dev && docker compose -p chart-dev up -d'

remote-check: remote-connect
	@$(VENV_PYTHON) -c 'import psycopg; connection = psycopg.connect("postgresql://chart:chart@127.0.0.1:5434/chart", connect_timeout=5); name = connection.execute("SHOW cluster_name").fetchone()[0]; connection.close(); name == "chart-dev" or exit("Refusing to use a database that is not the isolated chart-dev cluster."); print("Isolated development Postgres is ready.")'
	@curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8080/realms/chart/.well-known/openid-configuration >/dev/null
	@curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8025/ >/dev/null
	@printf 'Remote development Keycloak and Mailpit are ready.\n'
