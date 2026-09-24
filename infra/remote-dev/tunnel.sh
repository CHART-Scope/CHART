#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
state_dir="$repo_dir/.local/remote-dev"
ssh_host="${CHART_SSH_HOST:-chart}"
action="${1:-connect}"

# Keep SSH options and socket names out of user-provided host values.
if [[ ! "$ssh_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$ ]] || [ "${#ssh_host}" -gt 40 ]; then
  printf 'CHART_SSH_HOST must be a short SSH alias or user@host.\n' >&2
  exit 2
fi
mkdir -p "$state_dir"
chmod 700 "$state_dir"
socket="$state_dir/ssh-$ssh_host"

case "$action" in
  connect)
    if ssh -S "$socket" -O check "$ssh_host" >/dev/null 2>&1; then
      printf 'CHART development SSH tunnel is already connected.\n'
      exit 0
    fi
    ssh -M -S "$socket" -fnNT \
      -o BatchMode=yes -o ConnectTimeout=10 \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
      -o ControlPersist=no \
      -L 127.0.0.1:5434:127.0.0.1:15434 \
      -L 127.0.0.1:8080:127.0.0.1:18080 \
      -L 127.0.0.1:1025:127.0.0.1:11025 \
      -L 127.0.0.1:8025:127.0.0.1:18025 \
      "$ssh_host"
    printf 'Connected to isolated CHART development services via %s.\n' "$ssh_host"
    ;;
  status)
    ssh -S "$socket" -O check "$ssh_host"
    ;;
  disconnect)
    if ssh -S "$socket" -O check "$ssh_host" >/dev/null 2>&1; then
      ssh -S "$socket" -O exit "$ssh_host"
    fi
    ;;
  *)
    printf 'Usage: bash infra/remote-dev/tunnel.sh connect|status|disconnect\n' >&2
    exit 2
    ;;
esac
