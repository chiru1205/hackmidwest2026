#!/usr/bin/env bash
# Prints a Caddy bcrypt hash for the password stored in the file given as $1.
# Used by deploy.ps1 so the plain password never appears on a command line (first try)
# and is never printed. Run on the server (needs caddy installed).
set -euo pipefail
f="${1:?usage: hashpw.sh <password-file>}"
pw="$(cat "$f")"
pw="${pw%$'\r'}"
out="$(printf '%s\n' "$pw" | caddy hash-password 2>/dev/null | tail -n 1 || true)"
case "$out" in
  '$2'*) ;;
  *) out="$(caddy hash-password --plaintext "$pw" 2>/dev/null | tail -n 1 || true)" ;;
esac
case "$out" in
  '$2'*) printf '%s\n' "$out" ;;
  *) echo "hash-password failed" >&2; exit 1 ;;
esac
