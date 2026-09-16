import pathlib,subprocess,json,urllib.request,urllib.parse,sys
root=pathlib.Path('/opt/torob-cloud')
def get(url):
    with urllib.request.urlopen(url,timeout=10) as r:return json.load(r)
targets=get('http://127.0.0.1:9090/api/v1/targets')['data']['activeTargets']
print('Prometheus target health:',[(t['labels'].get('job'),t['health'],t.get('lastError')) for t in targets])
for query in ['up{job="torob-cloud"}','torob_dev_online{job="torob-cloud"}','torob_analytics_db_up{job="torob-cloud"}','torob_events_30d{job="torob-cloud",source="verification"}']:
    data=get('http://127.0.0.1:9090/api/v1/query?'+urllib.parse.urlencode({'query':query}))
    print(query,json.dumps(data['data']['result']))
print('Private listeners:')
subprocess.run(['ss','-lnt','sport = :19100 or sport = :19101 or sport = :5432'])
print('Backup timer:')
subprocess.run(['systemctl','list-timers','torob-cloud-backup.timer','--no-pager'])
