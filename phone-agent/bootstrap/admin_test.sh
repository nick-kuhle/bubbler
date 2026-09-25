#!/bin/sh
# admin_test.sh — one-shot health + self-test for the whole bubbler stack.
#
# Run on the laptop (from anywhere):
#   phone-agent/bootstrap/admin_test.sh            # checks AND auto-repairs
#   phone-agent/bootstrap/admin_test.sh --no-repair
#
# Covers, in order: cloud (homepage, agent event poll, heartbeat), laptop agent
# service, SSH tunnels (Frida 27042 + ZXTouch 6000), phone reachability and the
# phone-side services (frida-server, ZXTouch, Evony). Anything it can restart it
# does automatically (tunnels = start_tunnels.sh, agent = systemd user unit); a
# wildcard FAIL means a hands-on fix from docs/06-runbook.md.
#
# Env overrides: PHONE_IP, SSH_KEY, SSH_USER, BASE_URL, AGENT_TOKEN.

set -u

BASE_URL="${BASE_URL:-https://bubbler-eta.vercel.app}"
PHONE_IP="${PHONE_IP:-192.168.1.166}"
SSH_KEY="${SSH_KEY:-/tmp/opencode/bubbler_phone_ed25519}"
SSH_USER="${SSH_USER:-mobile}"

HERE="$(CDPATH= cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$HERE")"
if [ -z "${AGENT_TOKEN:-}" ]; then
  AGENT_TOKEN="$(sed -n 's/^[[:space:]]*agent_token:[[:space:]]*"\([^"]*\)"/\1/p' "$REPO_ROOT/config.yaml" | head -1)"
fi

NO_REPAIR=0
for a in "$@"; do [ "$a" = "--no-repair" ] && NO_REPAIR=1; done

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "  [PASS] $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  [FAIL] $1"; }
note() { echo "  [ .... ] $1"; }

run_agent_up() {
  systemctl --user is-active bubbler-agent 2>/dev/null | grep -qx active
}

echo "== stack summary =="
echo "  base:      $BASE_URL"
echo "  phone:     $SSH_USER@$PHONE_IP (key $SSH_KEY)"
echo "  date:      $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "  repair:    $([ "$NO_REPAIR" -eq 1 ] && echo disabled || echo enabled)"
echo

echo "== cloud =="
code="$(curl -sL -o /dev/null -w '%{http_code}' -m 15 "$BASE_URL/" || echo 000)"
[ "$code" = "200" ] && ok "homepage reachable (HTTP 200 after locale redirect)" || bad "homepage unreachable (final HTTP $code)"

agent_json="$(curl -s -m 12 -H "Authorization: Bearer $AGENT_TOKEN" "$BASE_URL/api/agent/events?hold=1")"
case "$agent_json" in
  *'"ok":true'*) ok "agent event poll authenticates against cloud" ;;
  *'"unauthorized"'*) bad "agent token rejected (compare config.yaml vs Vercel AGENT_BEARER_TOKEN)" ;;
  *) bad "agent event poll error: ${agent_json:-empty response}" ;;
esac

status_json="$(curl -s -m 12 -H "Authorization: Bearer $AGENT_TOKEN" "$BASE_URL/api/agent/status")"
case "$status_json" in
  *'"online":true'*)
    ok "cloud heartbeat ONLINE"
    echo "        heartbeat: $(echo "$status_json" | sed -n 's/.*"version":"\([^"]*\)".*"hostname":"\([^"]*\)".*"last_seen_at":"\([^"]*\)".*/version=\1 host=\2 last_seen=\3/p')"
    ;;
  *'"online":false'*)
    bad "cloud heartbeat OFFLINE — last poll older than the online window"
    echo "        $status_json"
    ;;
  *) bad "heartbeat endpoint rejected ($status_json — expected the agent token to work here)" ;;
esac
echo

echo "== laptop agent =="
if run_agent_up; then
  ok "bubbler-agent service is active"
else
  bad "bubbler-agent service not active"
  if [ "$NO_REPAIR" -eq 1 ]; then
    note "start it with: systemctl --user start bubbler-agent"
  else
    note "starting bubbler-agent…"
    systemctl --user start bubbler-agent 2>/dev/null || true
    sleep 3
    if run_agent_up; then ok "bubbler-agent started"; else bad "bubbler-agent still not active (check logs)"; fi
  fi
fi
echo

echo "== tunnels (frida 27042 + zxtouch 6000) =="
t1=no; t2=no
nc -z -w 3 127.0.0.1 27042 2>/dev/null && t1=yes
nc -z -w 3 127.0.0.1 6000 2>/dev/null && t2=yes
if [ "$t1" = yes ] && [ "$t2" = yes ]; then
  ok "tunnels open (127.0.0.1:27042 + 127.0.0.1:6000)"
else
  bad "tunnels down (27042=$t1, 6000=$t2)"
  if [ "$NO_REPAIR" -eq 1 ]; then
    note "open them with: phone-agent/bootstrap/start_tunnels.sh"
  else
    note "repairing: running start_tunnels.sh…"
    ( cd "$HERE" && ./start_tunnels.sh >/dev/null 2>&1 )
    sleep 2
    if nc -z -w 3 127.0.0.1 27042 2>/dev/null && nc -z -w 3 127.0.0.1 6000 2>/dev/null; then
      ok "tunnels reopened"
    else
      bad "tunnels still down (phone offline or SSHD down)"
    fi
  fi
fi
echo

echo "== phone ($PHONE_IP) =="
ssh_cmd="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if timeout 10 $ssh_cmd "$SSH_USER@$PHONE_IP" true 2>/dev/null; then
  ok "SSH reachable"
  procs="$(timeout 15 $ssh_cmd "$SSH_USER@$PHONE_IP" \
    'echo "frida $(ps aux | grep -ci "[f]rida-server")"; echo "zxtouch $(ps aux | grep -ci "[z]xtouch")"; echo "evony $(ps aux | grep -ci "[e]vony")"' 2>/dev/null)"
  f=$(echo "$procs" | sed -n 's/^frida //p')
  z=$(echo "$procs" | sed -n 's/^zxtouch //p')
  e=$(echo "$procs" | sed -n 's/^evony //p')
  [ "$f" = "1" ] || [ "$f" = "2" ] || [ "$f" = "3" ]
  if [ "$f" -ge 1 ] 2>/dev/null; then ok "frida-server running (${f} proc)"; else bad "frida-server NOT running"; fi
  if [ "$z" -ge 1 ] 2>/dev/null; then ok "ZXTouch running (${z} proc)"; else bad "ZXTouch NOT running (launch the app on the phone)"; fi
  if [ "$e" -ge 1 ] 2>/dev/null; then note "Evony open (${e} proc) — the agent closes it per job"; else note "Evony closed (idle — expected)"; fi
else
  bad "SSH unreachable — phone offline, asleep, or IP changed (PHONE_IP=$PHONE_IP)"
fi
echo

echo "== summary =="
echo "  PASS=$PASS  FAIL=$FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  ALL GREEN — agent, tunnels, phone and cloud are ready."
  echo "  Visual check: https://bubbler-eta.vercel.app/<locale>/master (War Room card)."
  exit 0
else
  echo "  $FAIL problem(s) above. If --no-repair was off and restart did not fix it, see docs/06-runbook.md."
  exit 1
fi