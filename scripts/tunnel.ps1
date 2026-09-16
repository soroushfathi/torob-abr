$ErrorActionPreference = 'Stop'
# Each forwarding listener is loopback-only. SSH configuration and keys stay with the existing alias.
ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:15432:127.0.0.1:5432 -L 127.0.0.1:19100:127.0.0.1:19100 -L 127.0.0.1:13300:127.0.0.1:3300 xdo-new
