import json, subprocess, urllib.request, base64, importlib.util
def inspect(name):
    return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
c=inspect('xdo-observability-grafana-1')
env=dict(x.split('=',1) for x in c['Config']['Env'])
auth=base64.b64encode((env['GF_SECURITY_ADMIN_USER']+':'+env['GF_SECURITY_ADMIN_PASSWORD']).encode()).decode()
for path in ['/api/health','/api/search?type=dash-folder','/api/datasources']:
    req=urllib.request.Request('http://127.0.0.1:3300'+path,headers={'Authorization':'Basic '+auth})
    try:
        data=json.load(urllib.request.urlopen(req, timeout=10))
        if isinstance(data,list): data=[{k:d.get(k) for k in ['uid','title','name','type','url']} for d in data]
        print(path,data)
    except Exception as e: print(path,type(e).__name__,getattr(e,'code',None))
print('psycopg:',bool(importlib.util.find_spec('psycopg')), 'psycopg2:',bool(importlib.util.find_spec('psycopg2')))
print('postgres size:')
pg=inspect('xdo-backend-postgres-1'); pe=dict(x.split('=',1) for x in pg['Config']['Env'])
subprocess.run(['docker','exec','xdo-backend-postgres-1','psql','-U',pe['POSTGRES_USER'],'-d','postgres','-Atc',"SELECT datname,pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE NOT datistemplate;"])
