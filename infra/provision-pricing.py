"""Input PAYLOAD is provided only by the reviewed local installer. Fixed scoped paths."""
import ast,base64,datetime,hashlib,json,os,pathlib,pwd,secrets,shutil,subprocess,urllib.request,urllib.error,sqlite3
root=pathlib.Path('/opt/torob-cloud');stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup=root/'backups'/('pricing-'+stamp);backup.mkdir(mode=0o700)
pg='xdo-backend-postgres-1'
container=json.loads(subprocess.check_output(['docker','inspect',pg]))[0]
admin=dict(x.split('=',1) for x in container['Config']['Env'])['POSTGRES_USER']
def sql(query,db='torob_cloud'):
    p=subprocess.run(['docker','exec','-i',pg,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U',admin,'-d',db],input=query.encode(),capture_output=True)
    if p.returncode: raise RuntimeError('Scoped pricing SQL failed; credential-bearing output suppressed')
    return p.stdout.decode()
files={name:base64.b64decode(data) for name,data in PAYLOAD.items()}
for name,data in files.items():
    if name.endswith('.py'):ast.parse(data.decode('utf-8'))
    if name.endswith('.json'):json.loads(data)
subprocess.run(['systemctl','start','torob-cloud-backup.service'],check=True,capture_output=True)
if not list((root/'backups').glob('torob_cloud-*.dump')):raise RuntimeError('Torob database backup missing')
# Preserve the old dedicated support files before writes.
targets={'infra/pricing/worker.py':root/'pricing/worker.py','infra/pricing/adapters/liara.py':root/'pricing/adapters/liara.py','infra/pricing/adapters/arvan.py':root/'pricing/adapters/arvan.py','infra/pricing/adapters/parsvds.py':root/'pricing/adapters/parsvds.py','infra/torob-cloud-pricing.service':pathlib.Path('/etc/systemd/system/torob-cloud-pricing.service'),'infra/gateway.py':root/'gateway.py','infra/dashboards/torob-pricing.json':root/'dashboards/torob-pricing.json'}
for name,target in targets.items():
    if target.exists():shutil.copy2(target,backup/name.replace('/','_'))
secure=root/'secrets/credentials.json';credentials=json.loads(secure.read_text());shutil.copy2(secure,backup/'credentials.json')
for role,key in [('torob_price_worker','price_worker_password'),('torob_price_admin','price_admin_password')]:
    exists=sql("SELECT count(*) FROM pg_roles WHERE rolname='"+role+"'",'postgres').strip()=='1'
    if exists and key not in credentials:raise RuntimeError('Existing role has unknown ownership; refusing takeover')
    if key not in credentials:credentials[key]=secrets.token_urlsafe(36)
    if not exists:sql(f"CREATE ROLE {role} LOGIN PASSWORD '{credentials[key]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3",'postgres')
    sql(f"ALTER ROLE {role} SET statement_timeout='5s'; ALTER ROLE {role} SET idle_in_transaction_session_timeout='15s'; GRANT CONNECT ON DATABASE torob_cloud TO {role}",'postgres')
secure.write_text(json.dumps(credentials));secure.chmod(0o600)
mount=next(m['Source'] for m in container['Mounts'] if m['Destination']=='/var/lib/postgresql/data')
hba=pathlib.Path(mount)/'pg_hba.conf';original=hba.read_text();marker='# torob-cloud pricing role boundary v1'
if marker not in original:
    (backup/'pg_hba.conf').write_text(original)
    block=marker+'\nhost torob_cloud torob_price_worker,torob_price_admin all scram-sha-256\nhost all torob_price_worker,torob_price_admin all reject\nlocal all torob_price_worker,torob_price_admin reject\n'
    hba.write_text(block+original)
    if sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL','postgres').strip()!='0':
        hba.write_text(original);raise RuntimeError('Pricing HBA validation failed; original restored')
    sql('SELECT pg_reload_conf()','postgres')
migration=files['migrations/004_pricing_packages.sql'].decode('utf-8');checksum=hashlib.sha256(migration.encode()).hexdigest()
previous=sql("SELECT checksum FROM app.migrations WHERE name='004_pricing_packages.sql'").strip()
if previous and previous!=checksum:raise RuntimeError('Pricing migration checksum mismatch')
if not previous:
    sql("BEGIN; SELECT pg_advisory_xact_lock(716402); SET ROLE torob_owner; "+migration+f"\nINSERT INTO app.migrations(name,checksum) VALUES('004_pricing_packages.sql','{checksum}'); COMMIT;")
registry=json.loads(files['.runtime/pricing-sources.json'])
def literal(value):return "'"+str(value).replace("'","''")+"'"
for source in registry:
    values=[source['id'],source['name'],json.dumps(source['urls'],ensure_ascii=False),json.dumps(source['services'],ensure_ascii=False),source['adapter'],source['parser_version'] or '',source['pricing_model'],source['support_status']]
    sql('INSERT INTO pricing.sources(id,name,urls,services,adapter,parser_version,pricing_model,support_status,enabled,next_run) VALUES('+','.join(map(literal,values))+','+str(source['enabled']).lower()+',now()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,urls=excluded.urls,services=excluded.services,adapter=excluded.adapter,parser_version=excluded.parser_version,pricing_model=excluded.pricing_model,support_status=excluded.support_status')
if subprocess.run(['id','torob-pricing'],capture_output=True).returncode:subprocess.run(['useradd','--system','--no-create-home','--shell','/usr/sbin/nologin','torob-pricing'],check=True,capture_output=True)
for name,target in targets.items():target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(files[name]);target.chmod(0o644)
service_user=pwd.getpwnam('torob-pricing');config=root/'pricing/worker.json';config.write_text(json.dumps({'password':credentials['price_worker_password']}));config.chmod(0o600);os.chown(config,service_user.pw_uid,service_user.pw_gid)
subprocess.run(['systemd-analyze','verify','/etc/systemd/system/torob-cloud-pricing.service'],check=True,capture_output=True)
# Grafana: only one dedicated dashboard, with a SQLite backup and previous JSON snapshot.
grafana=json.loads(subprocess.check_output(['docker','inspect','xdo-observability-grafana-1']))[0];env=dict(x.split('=',1) for x in grafana['Config']['Env']);volume=next(m['Source'] for m in grafana['Mounts'] if m['Destination']=='/var/lib/grafana')
with sqlite3.connect('file:'+volume+'/grafana.db?mode=ro',uri=True) as src,sqlite3.connect(backup/'grafana.db') as dst:src.backup(dst)
auth=base64.b64encode((env['GF_SECURITY_ADMIN_USER']+':'+env['GF_SECURITY_ADMIN_PASSWORD']).encode()).decode()
def api(method,path,data=None):
    req=urllib.request.Request('http://127.0.0.1:3300'+path,method=method,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'},data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
folder=api('GET','/api/folders/torob-cloud')
permissions=api('GET','/api/folders/torob-cloud/permissions')
if any(item.get('role') in ['Viewer','Editor'] and item.get('permission',0)>0 for item in permissions):raise RuntimeError('Torob folder is not admin-only; inspect before changing permissions')
try:
    current=api('GET','/api/dashboards/uid/torob-pricing')
    if current['meta'].get('folderUid')!='torob-cloud':raise RuntimeError('Dashboard UID is outside Torob folder')
    (backup/'torob-pricing.json').write_text(json.dumps(current))
except urllib.error.HTTPError as e:
    if e.code!=404:raise
dashboard=json.loads(files['infra/dashboards/torob-pricing.json']);api('POST','/api/dashboards/db',{'dashboard':dashboard,'folderUid':'torob-cloud','overwrite':True,'message':'Dedicated pricing source and estimate observability'})
subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True)
subprocess.run(['systemctl','enable','--now','torob-cloud-pricing.service'],check=True,capture_output=True)
subprocess.run(['systemctl','restart','torob-cloud-telemetry.service'],check=True,capture_output=True)
print('Scoped pricing schema, limited roles, support worker and dashboard installed. Backup: '+str(backup))
print('Application was not uploaded. Daily collection starts with an initial real source retrieval, not a product test.')
