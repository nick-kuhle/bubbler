#!/bin/sh
# tunnel.sh — hold the laptop-mode SSH tunnels to the phone in the foreground.
#
# systemd runs this for `bubbler-tunnel`; it owns the two forwards the agent needs:
#   127.0.0.1:27042 -> phone frida-server   (attach/control the foreground app)
#   127.0.0.1:6000  -> phone ZXTouch        (taps, swipes, screenshots)
#
# Kept as a script (not an inline ExecStart) so the ssh options live in one place and
# so a missing phone key fails fast with a real message instead of a 1138-restart loop.
#
# Env: PHONE_IP (default 192.168.1.166), SSH_KEY (default ~/.ssh/bubbler_phone_ed25519),
#      SSH_USER (default mobile).
set -eu

HERE="$(CDPATH= cd "$(dirname "$0")" && pwd)"

PHONE_IP="${PHONE_IP:-192.168.1.166}"
SSH_USER="${SSH_USER:-mobile}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/bubbler_phone_ed25519}"

# Fail fast: no key means no tunnels, and retrying cannot help.
"$HERE/ensure_phone_key.sh" --check

exec /usr/bin/ssh -i "$SSH_KEY" \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -N \
    -L 27042:127.0.0.1:27042 \
    -L 6000:127.0.0.1:6000 \
    "$SSH_USER@$PHONE_IP"
