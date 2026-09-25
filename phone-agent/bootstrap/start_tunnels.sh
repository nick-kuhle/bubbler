#!/bin/sh
# Open laptop-mode SSH tunnels to the phone (Frida 27042 + ZXTouch 6000) and preflight
# the phone-side services the agent needs. Run on the laptop BEFORE starting agent.py:
#   phone-agent/bootstrap/start_tunnels.sh
#
# Env: PHONE_IP (default 192.168.1.166), SSH_KEY (default /tmp/opencode/bubbler_phone_ed25519),
#      SSH_USER (default mobile). The agent config.yaml must point at 127.0.0.1:27042/6000.
set -e

PHONE_IP="${PHONE_IP:-192.168.12.162}"
SSH_KEY="${SSH_KEY:-/tmp/opencode/bubbler_phone_ed25519}"
SSH_USER="${SSH_USER:-mobile}"

ssh_opts="-i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=6"

echo "==> phone preflight ($PHONE_IP)"
if ! timeout 8 ssh $ssh_opts "$SSH_USER@$PHONE_IP" true 2>/dev/null; then
    echo "    SSH unreachable — the phone is offline or not on this WiFi" >&2
    exit 1
fi

echo "==> frida-server"
timeout 8 ssh $ssh_opts "$SSH_USER@$PHONE_IP" \
    'ps aux | grep -i "[f]rida-server" >/dev/null && echo "    running" || echo "    NOT RUNNING (start frida-server on the phone)"'

echo "==> ZXTouch (port 6000)"
if timeout 4 ssh $ssh_opts "$SSH_USER@$PHONE_IP" 'ps aux | grep -i "[z]xtouch" | grep -v grep' >/dev/null 2>&1; then
    echo "    running"
else
    echo "    NOT RUNNING — launch the ZXTouch app on the phone first (input/screenshot need it)"
fi

echo "==> Evony"
timeout 8 ssh $ssh_opts "$SSH_USER@$PHONE_IP" \
    'ps aux | grep -i "[e]vony" | grep -v grep >/dev/null && echo "    running" || echo "    not running (the agent opens it per job)"'

echo "==> opening tunnels"
for port in 27042 6000; do
    if nc -z -w 3 127.0.0.1 "$port" 2>/dev/null; then
        echo "    127.0.0.1:$port already open"
        continue
    fi
    # -f backgrounds the tunnel; -N sends no remote command.
    ssh $ssh_opts -f -N -L "$port:127.0.0.1:$port" "$SSH_USER@$PHONE_IP"
    sleep 1
    if nc -z -w 3 127.0.0.1 "$port" 2>/dev/null; then
        echo "    127.0.0.1:$port up"
    else
        echo "    127.0.0.1:$port FAILED to come up" >&2
        exit 1
    fi
done

echo "==> tunnels ready — start the agent (systemd: systemctl start bubbler-agent)"
