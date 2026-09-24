#!/bin/sh
# Supervise the on-device bubbler agent without launchd.
#
# Why not the LaunchDaemon (docs/06): Dopamine's launchd pins daemon-class processes to a
# ~6MB jetsam memory limit (JETSAM_REASON_MEMORY_PERPROCESSLIMIT), and JETSAM instantly
# SODKILLs python+requests no matter the ProcessType/JetsamMemoryLimit plist keys. A
# process spawned from an SSH session inherits sshd's higher jetsam class instead and runs
# fine. This loop restarts the agent if it dies for any reason (the agent also self-exits
# after `cloud.max_idle_sec`/`max_failures` so the supervisor relaunches it fresh).
#
# Start (one line, survives disconnection, run as root):
#   sudo sh -c 'nohup /var/jb/usr/libexec/bubbler/bootstrap/run_agent_supervised.sh >/dev/null 2>&1 &'
# After a phone reboot, run it again (manual step until a launchd-safe launcher exists).
set -u
cd /var/jb/usr/libexec/bubbler || exit 1
export PATH=/var/jb/usr/bin:/var/jb/usr/local/bin:/usr/bin:/bin
PY=/var/jb/usr/bin/python3

while :; do
  echo "[supervisor] starting agent at $(date -Iseconds)" >> agent.log
  "$PY" agent.py
  code=$?
  echo "[supervisor] agent exited (code $code); restarting in 5s" >> agent.log
  sleep 5
done