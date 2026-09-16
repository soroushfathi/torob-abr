"""Explicitly scoped provisioning. No application deployment or shared service restart."""
import pathlib, subprocess, json, secrets, os, datetime
ROOT=pathlib.Path('/opt/torob-cloud')
ROOT.mkdir(mode=0o755, exist_ok=True)
secure=ROOT/'secrets'; secure.mkdir(mode=0o700,exist_ok=True)
backups=ROOT/'backups'; backups.mkdir(mode=0o700,exist_ok=True)
pg='xdo-backend-postgres-1'
c=json.loads(subprocess.check_output(['docker','inspect',pg]))[0]
admin=dict(x.split('=',1) for x in c['Config']['Env'])['POSTGRES_USER']
def sql(query,db='postgres'):
    r=subprocess.run(['docker','exec','-i',pg,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U',admin,'-d',db], input=query.encode(),capture_output=True)
    if r.returncode: raise RuntimeError('Scoped SQL operation failed; output suppressed to protect credentials')
    return r.stdout.decode()
credentials=secure/'credentials.json'
if credentials.exists(): data=json.loads(credentials.read_text())
else:
    data={k:secrets.token_urlsafe(36) for k in ['owner_password','app_password','analytics_password','telemetry_token','local_access_token']}
    credentials.write_text(json.dumps(data)); credentials.chmod(0o600)
roles=sql("SELECT rolname FROM pg_roles WHERE rolname LIKE 'torob_%';")
for name,key in [('torob_owner','owner_password'),('torob_app','app_password'),('torob_analytics','analytics_password')]:
    if name not in roles:
        sql(f"CREATE ROLE {name} LOGIN PASSWORD '{data[key]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;")
    sql(f"ALTER ROLE {name} SET statement_timeout='5s'; ALTER ROLE {name} SET idle_in_transaction_session_timeout='15s';")
if 'torob_cloud' not in sql('SELECT datname FROM pg_database;'):
    sql('CREATE DATABASE torob_cloud OWNER torob_owner;')
sql('REVOKE ALL ON DATABASE torob_cloud FROM PUBLIC; GRANT CONNECT ON DATABASE torob_cloud TO torob_app,torob_analytics;')
sql('REVOKE ALL ON SCHEMA public FROM PUBLIC; CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION torob_owner; GRANT USAGE ON SCHEMA app TO torob_app,torob_analytics;', 'torob_cloud')
sql("ALTER ROLE torob_app IN DATABASE torob_cloud SET search_path=app; ALTER ROLE torob_owner IN DATABASE torob_cloud SET search_path=app; ALTER ROLE torob_analytics SET default_transaction_read_only=on; ALTER ROLE torob_analytics IN DATABASE torob_cloud SET search_path=app;")
# Restrict ONLY the new roles; all existing HBA lines stay byte-for-byte below this block.
hba_path=c['Mounts'][0]['Source']+'/pg_hba.conf'
hba=pathlib.Path(hba_path); original=hba.read_text()
marker='# torob-cloud role boundary v1'
if marker not in original:
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    (backups/f'pg_hba.{stamp}.conf').write_text(original)
    block=marker+'\nhost torob_cloud torob_owner,torob_app,torob_analytics all scram-sha-256\nhost all torob_owner,torob_app,torob_analytics all reject\nlocal all torob_owner,torob_app,torob_analytics reject\n'
    hba.write_text(block+original)
    if int(sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;').strip()) != 0:
        hba.write_text(original); raise RuntimeError('HBA validation failed; restored original')
    sql('SELECT pg_reload_conf();')
if subprocess.run(['id','torob-cloud'],capture_output=True).returncode:
    subprocess.run(['useradd','--system','--home','/opt/torob-cloud','--shell','/usr/sbin/nologin','torob-cloud'],check=True)
state=ROOT/'state'; state.mkdir(mode=0o700,exist_ok=True)
import pwd
uid=pwd.getpwnam('torob-cloud').pw_uid; gid=pwd.getpwnam('torob-cloud').pw_gid
os.chown(state,uid,gid)
service_config=ROOT/'gateway.json'
service_config.write_text(json.dumps({'password':data['analytics_password'],'token':data['telemetry_token'],'bridge':'172.22.0.1','prometheus_ip':'172.22.0.7'})); service_config.chmod(0o600); os.chown(service_config,uid,gid)
subprocess.run(['python3','-m','venv',str(ROOT/'venv')],check=True)
r=subprocess.run([str(ROOT/'venv/bin/pip'),'install','--disable-pip-version-check','psycopg[binary]==3.2.10'],capture_output=True)
if r.returncode: raise RuntimeError('Isolated psycopg dependency install failed; credentials and DB already provisioned')
print('Dedicated database, roles, scoped HBA restrictions, telemetry user and isolated Python environment ready.')
