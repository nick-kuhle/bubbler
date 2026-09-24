#!/bin/sh
# Check where the bubbler agent is running and whether anything is listening.
# Answers "is the agent still on the phone?" in one shot (docs/06). Run on the laptop:
#   phone-agent/bootstrap/phone_health.sh
# Env: PHONE_IP/SSH_KEY/SSH_USER like start_tunnels.sh.
PHONE_IP="${PHONE_IP:-192.168.1.166}"
SSH_KEY="${SSH_KEY:-/tmp/opencode/bubbler_phone_ed25519}"
SSH_USER="${SSH_USER:-mobile}"
ssh_opts="-i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=6"

echo "== laptop: agent process =="
ps aux | grep -i "[a]gent\.py" | grep -v grep || echo "  no agent.py running on this machine"

echo "== laptop: tunnels =="
for port in 27042 6000; do
    nc -z -w 3 127.0.0.1 "$port" 2>/dev/null && echo "  127.0.0.1:$port open" || echo "  127.0.0.1:$port closed"
done

echo "== phone ($PHONE_IP): services =="
timeout 10 ssh $ssh_opts "$SSH_USER@$PHONE_IP" '
  echo "  LaunchDaemon: $(launchctl list 2>/dev/null | grep com.bubbler.agent || echo "not installed")"
  echo "  agent.log: $(ls -la /var/jb/usr/libexec/bubbler/agent.log 2>/dev/null || echo "no installed agent dir")"
  echo "  frida-server: $(ps aux | grep -i "[f]rida-server" | grep -v grep | wc -l | tr -d " ") proc(s)"
  echo "  zxtouch: $(ps aux | grep -i "[z]xtouch" | grep -v grep | wc -l | tr -d " ") proc(s)"
  echo "  evony: $(ps aux | grep -i "[e]vony" | grep -v grep | wc -l | tr -d " ") proc(s)"
' 2>/dev/null || echo "  phone unreachable"

echo "== cloud: heartbeat (dashboard War Room / GET /api/agent/status)"
echo "  open https://bubbler-eta.vercel.app/<locale>/master (operator) — 'phone agent' card"
