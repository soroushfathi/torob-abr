"""Install only reviewed Torob pricing support resources through xdo-new. No app deployment."""
import pathlib,subprocess,base64,json
root=pathlib.Path(__file__).resolve().parent.parent
paths=['infra/pricing/worker.py','infra/pricing/adapters/liara.py','infra/pricing/adapters/arvan.py','infra/torob-cloud-pricing.service','infra/gateway.py','infra/dashboards/torob-pricing.json','migrations/004_pricing_packages.sql','.runtime/pricing-sources.json']
payload={p:base64.b64encode((root/p).read_bytes()).decode() for p in paths}
provision=(root/'infra/provision-pricing.py').read_text(encoding='utf-8')
script='PAYLOAD='+repr(payload)+'\n'+provision
result=subprocess.run(['ssh','-o','BatchMode=yes','xdo-new','sudo -n python3 -'],input=script.encode(),capture_output=True)
if result.returncode:
    # Script emits only scoped configuration failures; no secret-bearing SQL or tool output.
    print(result.stdout.decode(errors='replace'));print(result.stderr.decode(errors='replace')[-3500:]);raise SystemExit(result.returncode)
print(result.stdout.decode())
