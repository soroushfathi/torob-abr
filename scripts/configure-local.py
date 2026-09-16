"""Copies only new Torob credentials into an ignored local environment file; never prints values."""
import pathlib,subprocess,json
root=pathlib.Path(__file__).resolve().parent.parent
target=root/'.env'
if target.exists(): raise SystemExit('.env exists; preserved. Update it intentionally if needed.')
r=subprocess.run(['ssh','xdo-new','sudo -n cat /opt/torob-cloud/secrets/credentials.json'],capture_output=True,check=True)
c=json.loads(r.stdout)
lines=['PORT=3100','DATABASE_URL=postgresql://torob_app:'+c['app_password']+'@127.0.0.1:15432/torob_cloud','MIGRATION_DATABASE_URL=postgresql://torob_owner:'+c['owner_password']+'@127.0.0.1:15432/torob_cloud','TELEMETRY_URL=http://127.0.0.1:19100','TELEMETRY_TOKEN='+c['telemetry_token'],'LOCAL_ACCESS_TOKEN='+c['local_access_token'],'GRAFANA_URL=http://127.0.0.1:13300','AI_MODE=rules']
target.write_text('\n'.join(lines)+'\n')
if __import__('os').name=='nt':
    who=subprocess.check_output(['whoami'],text=True).strip()
    subprocess.run(['icacls',str(target),'/inheritance:r','/grant:r',who+':F'],capture_output=True,check=True)
else: target.chmod(0o600)
print('Ignored local .env created with restricted file access. No credentials printed.')
