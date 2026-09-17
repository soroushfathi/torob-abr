import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import pg from 'pg';
const base='http://127.0.0.1:3100',results=[];
let cookie='';
async function request(path,data,auth=cookie){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:auth},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function ok(name){results.push(name);console.log('PASS',name);}
const login=await request('/api/session',{token:process.env.LOCAL_ACCESS_TOKEN,source:'verification'});assert.equal(login.status,200);cookie=login.cookie;ok('authenticated isolated verification session');
const health=await request('/api/health');assert.equal(health.body.database,'connected');ok('local application → SSH → dedicated PostgreSQL');
const created=await request('/api/projects',{name:'Verification · real persisted journey'});assert.equal(created.status,201);const id=created.body.id;
const recommendation=await request(`/api/projects/${id}/recommend`,{description:'Next.js rental application, PostgreSQL, Iran, small team',stack:'Next.js',database:'PostgreSQL',region:'Iran',operations:'small-team'});assert.equal(recommendation.status,200);assert.equal(recommendation.body.eligibleCount,0);ok('unknown prices never become confirmed eligible recommendations');
assert.equal((await request(`/api/projects/${id}/select`,{id:'hetzner'})).status,409);ok('hard region constraint blocks selection');
for(const name of ['comparison_viewed']) assert.equal((await request(`/api/projects/${id}/events`,{name})).status,200);
assert.equal((await request(`/api/projects/${id}/select`,{id:'liara-paas-mars'})).status,200);
for(const name of ['checklist_viewed','provider_clicked']) for(let i=0;i<2;i++)assert.equal((await request(`/api/projects/${id}/events`,{name,provider:'liara-paas-mars'})).status,200);
const analytics=await request('/api/analytics');assert.equal(analytics.body.events.find(x=>x.name==='provider_clicked').count,1);assert.equal(analytics.body.conversions,null);ok('real product events persisted, deduplicated; conversions unavailable');
assert.equal((await request(`/api/projects/${id}/plan`,{})).status,200);ok('versioned sandbox plan saved without execution');
const second=await request('/api/session',{token:process.env.LOCAL_ACCESS_TOKEN,source:'verification'});
assert.equal((await request(`/api/projects/${id}/select`,{id:'liara-paas-mars'},second.cookie)).status,404);ok('cross-session project ownership enforced');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
assert.equal((await db.query('SELECT count(*)::int AS n FROM app.events WHERE project_id=$1',[id])).rows[0].n,7);
try{await db.query('CREATE TABLE app.forbidden_test(id int)');assert.fail('App must not create tables');}catch(e){assert.equal(e.code,'42501');}ok('application DDL denied');
await db.end();
const fresh=new pg.Client({connectionString:process.env.DATABASE_URL});await fresh.connect();assert.equal((await fresh.query('SELECT name FROM app.projects WHERE id=$1',[id])).rowCount,1);await fresh.end();ok('data persists across independent database connections');
const incident=await request('/api/incidents',{kind:'database'});assert.equal(incident.status,200);assert.equal(incident.body.resource,'torob-cloud-local');
await mkdir('.runtime',{recursive:true});await writeFile('.runtime/verification.json',JSON.stringify({at:new Date().toISOString(),projectId:id,results,incident:incident.body},null,2));
console.log('SRE:',incident.body.status,'evidence records:',incident.body.evidence.length);
console.log('Saved .runtime/verification.json (no credentials).');
