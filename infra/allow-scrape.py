"""Permit only the existing Prometheus container to reach the private gateway."""
import subprocess,json,pathlib,shutil,datetime
root=pathlib.Path('/opt/torob-cloud')
net=json.loads(subprocess.check_output(['docker','network','inspect','xdo-observability_observability']))[0]
bridge='br-'+net['Id'][:12]
prom=json.loads(subprocess.check_output(['docker','inspect','xdo-observability-prometheus-1']))[0]['NetworkSettings']['Networks']['xdo-observability_observability']['IPAddress']
gateway=net['IPAM']['Config'][0]['Gateway']
config=json.loads((root/'gateway.json').read_text())
assert gateway==config['bridge'] and prom==config['prometheus_ip'], 'Private network changed; inspect before updating'
backup=root/'backups'/('ufw-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700)
for name in ['user.rules','user6.rules']:
    shutil.copy2('/etc/ufw/'+name,backup/name)
args=['allow','in','on',bridge,'proto','tcp','from',prom,'to',gateway,'port','19101','comment','torob-cloud private Prometheus scrape']
subprocess.run(['ufw','--dry-run',*args],check=True,capture_output=True)
subprocess.run(['ufw',*args],check=True)
print('Only',prom,'on',bridge,'can reach',gateway+':19101; no public listener opened.')
