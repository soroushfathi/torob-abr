"""Run after copying reviewed infra artifacts to /opt/torob-cloud. Back up and validate first."""
import pathlib,subprocess,json,urllib.request,urllib.error,base64,datetime,sqlite3,time,shutil
root=pathlib.Path('/opt/torob-cloud'); stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=root/'backups'/('monitoring-'+stamp);backup.mkdir(mode=0o700)
def get(url): return json.load(urllib.request.urlopen(url,timeout=8))
before=get('http://127.0.0.1:9090/api/v1/targets')
(backup/'targets-before.json').write_text(json.dumps(before))
for name in ['torob-cloud-telemetry.service','torob-cloud-backup.service','torob-cloud-backup.timer']:
    shutil.copyfile(root/name,'/etc/systemd/system/'+name)
subprocess.run(['systemd-analyze','verify','/etc/systemd/system/torob-cloud-telemetry.service','/etc/systemd/system/torob-cloud-backup.service','/etc/systemd/system/torob-cloud-backup.timer'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','torob-cloud-telemetry.service','torob-cloud-backup.timer'],check=True)
config=pathlib.Path('/opt/xdo/monitoring/target/prometheus.yml'); original=config.read_text();(backup/'prometheus.yml').write_text(original)
job='''
  # torob-cloud: private gateway, one application scope only
  - job_name: torob-cloud
    scrape_interval: 15s
    scrape_timeout: 5s
    sample_limit: 300
    body_size_limit: 128KB
    label_limit: 8
    static_configs:
      - targets: ["172.22.0.1:19101"]
        labels:
          service: torob-cloud
          environment: local-development
'''
if 'job_name: torob-cloud' not in original:
    candidate=root/'prometheus.candidate.yml';candidate.write_text(original+job)
    subprocess.run(['docker','cp',str(candidate),'xdo-observability-prometheus-1:/tmp/torob-candidate.yml'],check=True,capture_output=True)
    subprocess.run(['docker','exec','xdo-observability-prometheus-1','promtool','check','config','/tmp/torob-candidate.yml'],check=True)
    try:
        config.write_text(original+job) # preserve inode of bind-mounted shared config
        subprocess.run(['docker','kill','--signal=HUP','xdo-observability-prometheus-1'],check=True,capture_output=True)
        time.sleep(2)
        active=get('http://127.0.0.1:9090/api/v1/status/config')['data']['yaml']
        if 'job_name: torob-cloud' not in active: raise RuntimeError('Prometheus did not load the new job')
    except Exception:
        config.write_text(original);subprocess.run(['docker','kill','--signal=HUP','xdo-observability-prometheus-1'],capture_output=True);raise
grafana=json.loads(subprocess.check_output(['docker','inspect','xdo-observability-grafana-1']))[0]
env=dict(x.split('=',1) for x in grafana['Config']['Env'])
volume=next(m['Source'] for m in grafana['Mounts'] if m['Destination']=='/var/lib/grafana')
with sqlite3.connect('file:'+volume+'/grafana.db?mode=ro',uri=True) as src, sqlite3.connect(backup/'grafana.db') as dst: src.backup(dst)
auth=base64.b64encode((env['GF_SECURITY_ADMIN_USER']+':'+env['GF_SECURITY_ADMIN_PASSWORD']).encode()).decode()
def api(method,path,data=None):
    req=urllib.request.Request('http://127.0.0.1:3300'+path,method=method,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'},data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
try:api('GET','/api/folders/torob-cloud')
except urllib.error.HTTPError as e:
    if e.code!=404:raise
    api('POST','/api/folders',{'uid':'torob-cloud','title':'Torob Cloud / ترب ابر'})
# Only the new folder's permissions change. Existing folders and datasources are untouched.
api('POST','/api/folders/torob-cloud/permissions',{'items':[{'role':'Admin','permission':4}]})
for file in sorted((root/'dashboards').glob('torob-*.json')):
    dashboard=json.loads(file.read_text());uid=dashboard['uid']
    try:
        current=api('GET','/api/dashboards/uid/'+uid)
        if current['meta'].get('folderUid')!='torob-cloud': raise RuntimeError('Dashboard UID belongs to an unrelated folder; refusing overwrite')
        (backup/(uid+'.json')).write_text(json.dumps(current))
    except urllib.error.HTTPError as e:
        if e.code!=404:raise
    result=api('POST','/api/dashboards/db',{'dashboard':dashboard,'folderUid':'torob-cloud','overwrite':True,'message':'Torob Cloud reproducible scoped provisioning'})
    print('Dashboard:',result.get('url'))
print('Scoped monitoring provisioned. Shared snapshots:',str(backup))
