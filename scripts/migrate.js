import pg from 'pg';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,connectionTimeoutMillis:5000});
try {
 await db.connect(); await db.query('SELECT pg_advisory_lock(716402)');
 await db.query('CREATE TABLE IF NOT EXISTS app.migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of (await readdir('migrations')).filter(x=>x.endsWith('.sql')).sort()) {
  const sql=await readFile(`migrations/${name}`,'utf8'), checksum=createHash('sha256').update(sql).digest('hex');
  const previous=await db.query('SELECT checksum FROM app.migrations WHERE name=$1',[name]);
  if(previous.rowCount){if(previous.rows[0].checksum!==checksum) throw new Error('Migration checksum mismatch');continue;}
  await db.query('BEGIN');
  try {await db.query(sql);await db.query('INSERT INTO app.migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await db.query('COMMIT');console.log(`Applied ${name}`);}
  catch(e){await db.query('ROLLBACK');throw e;}
 }
 console.log('Migrations verified.');
} catch(e){console.error('Migration failed:',e.code||e.message);process.exitCode=1;} finally {await db.end();}
