#!/bin/sh
# ensure_phone_key.sh — resolve (and if needed create) the laptop's SSH key for the phone.
#
# The phone tunnel used to point at a key under /tmp, which a reboot deletes. That
# silently killed the frida/ZXTouch tunnels and made app control fall back to a local
# `uiopen` that does not exist on the laptop, so every job failed while the agent still
# looked "online" in the cloud heartbeat. The key now lives in ~/.ssh, which survives
# reboots and is the only sane place for it.
#
# Usage:
#   ensure_phone_key.sh              # print the resolved key path; create it if missing
#   ensure_phone_key.sh --print-pub  # also print the public key to authorize on the phone
#   ensure_phone_key.sh --check      # exit 1 (no output) unless the key is usable
#
# Env: SSH_KEY (default ~/.ssh/bubbler_phone_ed25519)
set -eu

SSH_KEY="${SSH_KEY:-$HOME/.ssh/bubbler_phone_ed25519}"
MODE="${1:-}"

ensure() {
    [ -f "$SSH_KEY" ] && return 0
    mkdir -p "$(dirname "$SSH_KEY")"
    chmod 700 "$(dirname "$SSH_KEY")"
    echo "==> no key at $SSH_KEY — generating a new one" >&2
    ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "bubbler-phone-tunnel" >/dev/null
    echo "==> generated. Authorize the public key on the phone, then restart the tunnel:" >&2
    echo "      systemctl --user restart bubbler-tunnel" >&2
}

case "$MODE" in
    --check)
        # For unit ExecStartPre / scripts: fail fast and loudly instead of letting ssh
        # retry a missing identity thousands of times.
        [ -s "$SSH_KEY" ] || { echo "phone SSH key missing: $SSH_KEY" >&2; exit 1; }
        [ -r "$SSH_KEY" ] || { echo "phone SSH key unreadable: $SSH_KEY" >&2; exit 1; }
        chmod 600 "$SSH_KEY" 2>/dev/null || true
        exit 0
        ;;
    --print-pub)
        ensure
        echo "$SSH_KEY"
        cat "$SSH_KEY.pub"
        ;;
    "")
        ensure
        echo "$SSH_KEY"
        ;;
    *)
        echo "usage: $0 [--print-pub|--check]" >&2
        exit 2
        ;;
esac
