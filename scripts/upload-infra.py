"""Upload only the allowlisted support-service artifacts. Does not upload the application."""
import pathlib,subprocess,base64,json
root=pathlib.Path(__file__).resolve().parent.parent
files=[root/'infra'/n for n in ['gateway.py','backup.py','torob-cloud-telemetry.service','torob-cloud-backup.service','torob-cloud-backup.timer']]+list((root/'infra/dashboards').glob('torob-*.json'))
payload={str(p.relative_to(root/'infra')).replace('\\','/'):base64.b64encode(p.read_bytes()).decode() for p in files}
script="import pathlib,base64,json\nroot=pathlib.Path('/opt/torob-cloud')\npayload=json.loads("+repr(json.dumps(payload))+ ")\nfor name,data in payload.items():\n p=root/name; p.parent.mkdir(exist_ok=True); p.write_bytes(base64.b64decode(data)); p.chmod(0o644)\nprint('Reviewed support artifacts uploaded; no application files.')\n"
subprocess.run(['ssh','xdo-new','sudo -n python3 -'],input=script.encode(),check=True)
