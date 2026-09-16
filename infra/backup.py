"""Dedicated logical backup; bounded retention. No changes to shared PostgreSQL data."""
import subprocess,json,pathlib,datetime,os
os.umask(0o077)
root=pathlib.Path('/opt/torob-cloud/backups'); root.mkdir(exist_ok=True)
c=json.loads(subprocess.check_output(['docker','inspect','xdo-backend-postgres-1']))[0]
admin=dict(x.split('=',1) for x in c['Config']['Env'])['POSTGRES_USER']
name=datetime.datetime.now(datetime.timezone.utc).strftime('torob_cloud-%Y%m%dT%H%M%SZ.dump')
tmp=root/(name+'.partial'); target=root/name
with tmp.open('wb') as f:
    subprocess.run(['docker','exec','xdo-backend-postgres-1','pg_dump','-U',admin,'-d','torob_cloud','-Fc','--no-owner','--no-acl'],stdout=f,check=True,timeout=120)
tmp.rename(target)
for old in sorted(root.glob('torob_cloud-*.dump'),reverse=True)[7:]: old.unlink()
print('Torob Cloud logical backup complete:',name)
