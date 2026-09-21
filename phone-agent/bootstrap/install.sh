#!/bin/sh
# Install the bubbler on-device agent as a LaunchDaemon on the jailbroken iPhone.
# Run ON the phone (or via ssh mobile@<phone-ip>) from the repo root:
#   phone-agent/bootstrap/install.sh
set -e

AGENT_DIR="/var/jb/usr/libexec/bubbler"
PLIST="/var/jb/Library/LaunchDaemons/com.bubbler.agent.plist"

echo "==> Installing agent into $AGENT_DIR"
mkdir -p "$AGENT_DIR"
cp -R phone-agent/. "$AGENT_DIR/"

echo "==> Installing LaunchDaemon plist"
cp phone-agent/bootstrap/com.bubbler.agent.plist "$PLIST"
chown root:wheel "$PLIST"
chmod 644 "$PLIST"

echo "==> (re)loading daemon"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "==> done. Logs: $AGENT_DIR/agent.log"
echo "    Check: launchctl list | grep bubbler"