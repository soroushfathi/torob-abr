"""Append pricing admin credentials to ignored .env without displaying them."""
import json,pathlib,secrets,subprocess,urllib.parse
root=pathlib.Path(__file__).resolve().parent.parent;env=root/'.env'
if not env.exists():raise SystemExit('Configure base .env first')
query="import json,pathlib; c=json.loads(pathlib.Path('/opt/torob-cloud/secrets/credentials.json').read_text()); print(json.dumps({'password':c['price_admin_password']}))"
r=subprocess.run(['ssh','-o','BatchMode=yes','xdo-new','sudo -n python3 -'],input=query.encode(),capture_output=True,check=True)
credential=json.loads(r.stdout)['password'];text=env.read_text(encoding='utf-8');add=[]
if not any(line.startswith('ADMIN_ACCESS_TOKEN=') for line in text.splitlines()):add.append('ADMIN_ACCESS_TOKEN='+secrets.token_urlsafe(36))
if not any(line.startswith('PRICING_ADMIN_DATABASE_URL=') for line in text.splitlines()):add.append('PRICING_ADMIN_DATABASE_URL=postgresql://torob_price_admin:'+urllib.parse.quote(credential,safe='')+'@127.0.0.1:15432/torob_cloud')
if add:env.write_text(text.rstrip()+'\n'+'\n'.join(add)+'\n',encoding='utf-8')
print('Local admin pricing settings saved in ignored .env; values not printed.')
