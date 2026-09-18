import express from 'express';
import pg from 'pg';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';
import {catalog,recommend,reportIncident} from './domain.js';
import {requirementsSchema,intakeFormDefaults} from './advisor/requirements.js';
import {loadCatalog} from './pricing/catalog-store.js';
import {registerPricingAdmin} from './pricing/admin.js';
import {configurationFromRequirements,estimateArvan} from './pricing/arvan-estimate.js';
import {attachMeteredPackage} from './advisor/metered-package.js';
import {findReportOption} from './advisor/package-options.js';
const app=express(), port=Number(process.env.PORT||3100);
if(!process.env.LOCAL_ACCESS_TOKEN||!process.env.DATABASE_URL) throw new Error('Configure ignored .env first');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:4000,idleTimeoutMillis:10000});
pool.on('error',()=>{});
const adminPool=process.env.PRICING_ADMIN_DATABASE_URL?new pg.Pool({connectionString:process.env.PRICING_ADMIN_DATABASE_URL,max:2,connectionTimeoutMillis:4000}):null;
adminPool?.on('error',()=>{});
if(process.env.ADMIN_ACCESS_TOKEN&&secretEqual(process.env.ADMIN_ACCESS_TOKEN,process.env.LOCAL_ACCESS_TOKEN))throw new Error('Admin and user keys must differ');
const counters={requests:0,errors:0,duration:0,ai:0,fallback:0}, bounds=[.01,.05,.1,.25,.5,1,2.5,5,10], buckets=bounds.map(()=>0);
let dbUp=0,telemetry='pending',lastCpu=process.cpuUsage(),lastTime=performance.now();
app.disable('x-powered-by');
app.use((req,res,next)=>{
 if(!['127.0.0.1','localhost'].includes(req.hostname)) return res.status(403).json({error:'Invalid local host'});
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`) return res.status(403).json({error:'Cross-origin mutation denied'});
 res.set({'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 const start=performance.now();res.on('finish',()=>{const seconds=(performance.now()-start)/1000;counters.requests++;counters.duration+=seconds;if(res.statusCode>=500)counters.errors++;bounds.forEach((b,i)=>{if(seconds<=b)buckets[i]++;});});next();
});
app.use(express.json({limit:'32kb'}));
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
function secretEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function sessionId(req){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('torob_session='))?.slice(14);return token?createHash('sha256').update(token).digest('hex'):null;}
let attempts=[];
function limitSignIn(req,res,next){
 attempts=attempts.filter(t=>t>Date.now()-60000);
 if(attempts.length>=20)return res.status(429).json({error:'برای تلاش دوباره یک دقیقه صبر کنید.'});attempts.push(Date.now());next();
}
app.post('/api/session',limitSignIn,async(req,res)=>{
 const role=process.env.ADMIN_ACCESS_TOKEN&&secretEqual(req.body.token,process.env.ADMIN_ACCESS_TOKEN)?'admin':'user';
 if(role!=='admin'&&!secretEqual(req.body.token,process.env.LOCAL_ACCESS_TOKEN))return res.status(401).json({error:'کلید ورود معتبر نیست'});
 const token=randomBytes(32).toString('hex'),id=createHash('sha256').update(token).digest('hex');
 await pool.query('INSERT INTO app.sessions(id,source,role) VALUES($1,$2,$3)',[id,req.body.source==='verification'?'verification':'user',role]);
 res.setHeader('Set-Cookie',`torob_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`);res.json({ok:true});
});
app.post('/api/session/logout',async(req,res)=>{
 const id=sessionId(req);
 if(id)await pool.query('UPDATE app.sessions SET expires_at=LEAST(expires_at,now()) WHERE id=$1',[id]);
 res.setHeader('Set-Cookie','torob_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true});
});
app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');dbUp=1;res.json({status:'ok',database:'connected',telemetry});}catch{dbUp=0;res.status(503).json({status:'unavailable',database:'unavailable',telemetry});}});
app.use('/api',async(req,res,next)=>{
 const id=sessionId(req);
 if(!id)return res.status(401).json({error:'ورود لازم است'});
 const r=await pool.query('SELECT id,source,role FROM app.sessions WHERE id=$1 AND expires_at>now()',[id]);
 if(!r.rowCount)return res.status(401).json({error:'نشست منقضی شده'});req.session=r.rows[0];next();
});
app.post('/api/session/role',limitSignIn,async(req,res)=>{
 const {role,token}=z.object({role:z.enum(['admin','user']),token:z.string().max(1024).optional()}).parse(req.body);
 if(role==='admin'&&(!process.env.ADMIN_ACCESS_TOKEN||!secretEqual(token,process.env.ADMIN_ACCESS_TOKEN)))return res.status(403).json({error:'کلید مدیر معتبر نیست.'});
 const result=await pool.query('UPDATE app.sessions SET role=$1 WHERE id=$2 AND expires_at>now() RETURNING role',[role,req.session.id]);
 if(!result.rowCount)return res.status(401).json({error:'نشست منقضی شده؛ دوباره وارد شوید.'});
 res.json({ok:true,role:result.rows[0].role});
});
const requirements=requirementsSchema;
registerPricingAdmin(app,adminPool);
async function owned(req){const r=await pool.query('SELECT * FROM app.projects WHERE id=$1 AND owner=$2',[req.params.id,req.session.id]);if(!r.rowCount)throw Object.assign(new Error('پروژه یافت نشد'),{status:404});return r.rows[0];}
async function event(db,project,name,session,provider=''){await db.query('INSERT INTO app.events(project_id,name,source,provider) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[project,name,session.source,provider]);}
app.get('/api/me',(req,res)=>res.json({source:req.session.source,role:req.session.role}));
app.get('/api/catalog',async(req,res)=>res.json(await loadCatalog(pool)));
app.get('/api/projects',async(req,res)=>res.json((await pool.query('SELECT * FROM app.projects WHERE owner=$1 ORDER BY created_at DESC',[req.session.id])).rows.map(p=>({...p,formDefaults:intakeFormDefaults(p.requirements)}))));
app.post('/api/projects',async(req,res)=>{
 const input=z.object({name:z.string().min(1).max(120)}).parse(req.body),id=randomUUID(),db=await pool.connect();
 try{await db.query('BEGIN');await db.query('INSERT INTO app.projects(id,owner,name) VALUES($1,$2,$3)',[id,req.session.id,input.name]);await event(db,id,'intake_started',req.session);await db.query('COMMIT');res.status(201).json({id});}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
});
app.post('/api/projects/:id/recommend',async(req,res)=>{
 await owned(req);const input=requirements.parse(req.body),current=await loadCatalog(pool),result=recommend(input,Date.now(),current);
 const reportId=randomUUID();
 if(['arvan-iaas','arvan-container'].includes(input.pricingPreference)){
  const configuration=configurationFromRequirements(input),tariff=current.tariffs.find(p=>p.providerId==='arvan'&&p.service===configuration.service);
  let estimate={status:'tariff_unavailable',configuration,errors:['تعرفهٔ منتشرشدهٔ آروان در دسترس نیست.']};
  if(tariff&&Date.now()-Date.parse(tariff.verifiedAt)<=7*86400000){
   const allowed=(await pool.query("SELECT NOT EXISTS(SELECT 1 FROM pricing.estimates WHERE requested_by=$1 AND (created_at>now()-interval '1 minute' OR status IN ('queued','running'))) AS ok",[req.session.id])).rows[0].ok;
   if(!allowed)return res.status(429).json({error:'برای برآورد بعدی یک دقیقه صبر کنید.'});
   const estimateId=randomUUID();await pool.query("INSERT INTO pricing.estimates(id,project_id,report_id,requested_by,tariff_version,configuration,status,started_at) VALUES($1,$2,$3,$4,$5,$6,'running',now())",[estimateId,req.params.id,reportId,req.session.id,tariff.versionId,configuration]);
   estimate=await estimateArvan(tariff,configuration,current.tariffs.find(p=>p.providerId==='arvan'&&p.service==='devops'));
   await pool.query("SELECT pricing.finish_estimate($1,$2,$3,$4)",[estimateId,req.session.id,estimate,estimate.evidence||null]);
   result.estimateId=estimateId;
  }
  attachMeteredPackage(result,input,estimate);
 }
 result.reportId=reportId;const db=await pool.connect();
 try{await db.query('BEGIN');await db.query('INSERT INTO app.reports(id,project_id,rules_version,catalog_version,snapshot) VALUES($1,$2,$3,$4,$5)',[reportId,req.params.id,result.rulesVersion,result.catalogVersion,result]);await db.query('UPDATE app.projects SET requirements=$1,recommendation=$2,selected=NULL WHERE id=$3',[input,result,req.params.id]);await event(db,req.params.id,'intake_completed',req.session);if(result.eligibleCount>0)await event(db,req.params.id,'recommendation_succeeded',req.session);else await event(db,req.params.id,'no_eligible_option',req.session);await db.query('COMMIT');res.json(result);}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
});
app.post('/api/projects/:id/events',async(req,res)=>{
 const p=await owned(req),input=z.object({name:z.enum(['comparison_viewed','checklist_viewed','provider_clicked','feedback_useful','feedback_not_useful']),provider:z.string().regex(/^[a-z0-9-]{1,64}$/).optional()}).parse(req.body);
 if(!p.recommendation)return res.status(409).json({error:'ابتدا مقایسه را بسازید'});
 if(['checklist_viewed','provider_clicked'].includes(input.name)&&(!p.selected||input.provider&&input.provider!==p.selected))return res.status(409).json({error:'ابتدا گزینه را انتخاب کنید'});
 const selected=findReportOption(p.recommendation,p.selected);
 if(input.name==='provider_clicked'&&!selected)return res.status(409).json({error:'ابتدا مقایسه را با کاتالوگ ایران به‌روز کنید'});
 await event(pool,p.id,input.name,req.session,input.name==='provider_clicked'?(selected.providerId||p.selected):'');res.json({ok:true});
});
app.post('/api/projects/:id/select',async(req,res)=>{
 const p=await owned(req),id=z.string().regex(/^[a-z0-9-]{1,64}$/).parse(req.body.id),o=findReportOption(p.recommendation,id);
 if(req.body.reportId&&req.body.reportId!==p.recommendation?.reportId)return res.status(409).json({error:'گزارش تازه‌تری ساخته شده است؛ پروژه را دوباره باز کنید.'});
 if(!o||o.status==='ineligible')return res.status(409).json({error:'این گزینه شرایط لازم را ندارد'});
 const db=await pool.connect();try{await db.query('BEGIN');await db.query('UPDATE app.projects SET selected=$1 WHERE id=$2',[id,p.id]);await event(db,p.id,'plan_selected',req.session,o.providerId||id);await db.query('COMMIT');res.json({option:o,confirmedEligible:o.status==='eligible'});}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
});
app.get('/api/projects/:id/reports',async(req,res)=>{await owned(req);res.json((await pool.query('SELECT id,rules_version,catalog_version,created_at FROM app.reports WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50',[req.params.id])).rows);});
app.get('/api/projects/:id/reports/:reportId',async(req,res)=>{await owned(req);const r=await pool.query('SELECT snapshot FROM app.reports WHERE id=$1 AND project_id=$2',[z.uuid().parse(req.params.reportId),req.params.id]);if(!r.rowCount)return res.status(404).json({error:'گزارش یافت نشد'});res.json(r.rows[0].snapshot);});
app.get('/api/analytics',async(req,res)=>{
 const r=await pool.query('SELECT e.name,count(*)::int AS count FROM app.events e JOIN app.projects p ON p.id=e.project_id WHERE p.owner=$1 AND e.occurred_at>=now()-interval \'30 days\' GROUP BY e.name',[req.session.id]);res.json({window:'30 days',events:r.rows,conversions:null,revenue:null,source:req.session.source});
});
app.post('/api/projects/:id/plan',async(req,res)=>{
 const p=await owned(req);if(!p.selected)return res.status(409).json({error:'ابتدا گزینه را انتخاب کنید'});
 const plan={version:1,scope:'torob-cloud-sandbox',runtime:'local Docker Compose',services:['sample'],envNames:[],network:'127.0.0.1:3180',storage:'none (stateless sample)',migrations:'none for sample; npm run migrate for Torob Cloud separately',health:'HTTP GET /',verification:'HTTP 200 with Torob Cloud sandbox marker',rollback:'docker compose -p torob-cloud-sandbox -f infra/sandbox/compose.yml down (no volumes removed)',actions:['deploy','inspect','rollback'],execution:'unavailable: Docker runtime not installed on this development machine',reviewRequired:true};
 const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex'),id=randomUUID();await pool.query('INSERT INTO app.plans(id,project_id,version,digest,plan) VALUES($1,$2,$3,$4,$5)',[id,p.id,1,digest,plan]);res.json({id,digest,plan});
});
app.post('/api/incidents',async(req,res)=>{
 const kind=z.enum(['latency','resources','database']).parse(req.body.kind);let payload;
 try{const r=await fetch(process.env.TELEMETRY_URL+'/evidence/'+kind,{headers:{Authorization:'Bearer '+process.env.TELEMETRY_TOKEN},signal:AbortSignal.timeout(18000)});if(r.ok){const raw=await r.text();if(raw.length<=1048576)payload=JSON.parse(raw);}}catch{}
 const report=reportIncident(kind,payload),id=randomUUID();await pool.query('INSERT INTO app.incidents(id,owner,kind,report) VALUES($1,$2,$3,$4)',[id,req.session.id,kind,report]);res.json({id,...report});
});
app.get('/api/incidents',async(req,res)=>res.json((await pool.query('SELECT * FROM app.incidents WHERE owner=$1 ORDER BY created_at DESC LIMIT 20',[req.session.id])).rows));
app.use(express.static('public'));
app.use((err,req,res,next)=>{const status=err instanceof z.ZodError?400:err.status||500;res.status(status).json({error:status===500?'سرویس موقتاً در دسترس نیست؛ اتصال دیتابیس را بررسی کنید':status===400?'ورودی معتبر نیست':err.message});});
async function pushTelemetry(){
 try{await pool.query('SELECT 1');dbUp=1;}catch{dbUp=0;}
 const now=performance.now(),cpu=process.cpuUsage(),ratio=Math.max(0,(cpu.user+cpu.system-lastCpu.user-lastCpu.system)/1000/(now-lastTime));lastCpu=cpu;lastTime=now;
 const values={torob_http_requests_total:counters.requests,torob_http_errors_total:counters.errors,torob_http_duration_seconds_sum:counters.duration,torob_http_duration_seconds_count:counters.requests,torob_db_up:dbUp,torob_process_rss_bytes:process.memoryUsage().rss,torob_process_cpu_ratio:ratio};
 const metrics=Object.entries(values).map(([name,value])=>({name,value,labels:{}}));bounds.forEach((le,i)=>metrics.push({name:'torob_http_duration_seconds_bucket',value:buckets[i],labels:{le:String(le)}}));metrics.push({name:'torob_http_duration_seconds_bucket',value:counters.requests,labels:{le:'+Inf'}});
 try{const r=await fetch(process.env.TELEMETRY_URL+'/ingest',{method:'POST',headers:{Authorization:'Bearer '+process.env.TELEMETRY_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({metrics}),signal:AbortSignal.timeout(5000)});telemetry=r.ok?'connected':'unavailable';}catch{telemetry='unavailable';}
}
if(process.env.TELEMETRY_URL!=='http://127.0.0.1:19100')throw new Error('Only the configured private SSH telemetry endpoint is allowed');
app.listen(port,'127.0.0.1',()=>{console.log(`Torob Cloud local: http://127.0.0.1:${port}`);pushTelemetry();});
setInterval(pushTelemetry,15000).unref();
