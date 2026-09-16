"""Backup and restore only to a dedicated disposable recovery-check database."""
import subprocess,pathlib,json,datetime
root=pathlib.Path('/opt/torob-cloud')
subprocess.run(['python3',str(root/'backup.py')],check=True)
dump=sorted((root/'backups').glob('torob_cloud-*.dump'))[-1]
pg='xdo-backend-postgres-1'
c=json.loads(subprocess.check_output(['docker','inspect',pg]))[0]
admin=dict(x.split('=',1) for x in c['Config']['Env'])['POSTGRES_USER']
def sql(query,db='postgres'):
    return subprocess.check_output(['docker','exec',pg,'psql','-X','-v','ON_ERROR_STOP=1','-U',admin,'-d',db,'-Atc',query],text=True).strip()
name='torob_cloud_restorecheck_'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
sql('CREATE DATABASE '+name)
try:
    with dump.open('rb') as f: subprocess.run(['docker','exec','-i',pg,'pg_restore','-U',admin,'-d',name,'--no-owner','--no-acl','--exit-on-error'],stdin=f,check=True)
    for table in ['projects','events','incidents','plans','migrations']:
        original=sql('SELECT count(*) FROM app.'+table,'torob_cloud');restored=sql('SELECT count(*) FROM app.'+table,name)
        assert original==restored,(table,original,restored)
        print('Verified restored',table,restored,'rows')
    print('Recovery check passed; dropping only the disposable recovery-check database.')
finally:
    sql('DROP DATABASE '+name)
