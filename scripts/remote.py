"""Run a reviewed local UTF-8 script through the existing SSH alias, with LF stdin."""
import subprocess, sys, pathlib
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/remote.py path/to/reviewed-script.py')
script = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig')
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'xdo-new', 'sudo -n python3 -'], input=script.encode('utf-8'))
raise SystemExit(result.returncode)
