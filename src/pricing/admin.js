import {randomUUID} from 'node:crypto';
import {z} from 'zod';
const providerId=z.string().regex(/^[a-z0-9-]{1,40}$/);
export function registerPricingAdmin(app,adminPool) {
 app.use('/api/admin',(req,res,next)=>{if(req.session.role!=='admin')return res.status(403).json({error:'این بخش مخصوص مدیر است.'});if(!adminPool)return res.status(503).json({error:'اتصال مدیریت قیمت تنظیم نشده است.'});next();});
 app.get('/api/admin/pricing',async(req,res)=>{
  const sources=(await adminPool.query('SELECT * FROM pricing.source_status ORDER BY id')).rows;
  const runs=(await adminPool.query('SELECT id,provider_id,trigger,started_at,finished_at,created_at,status,stages,error_code,error_message,parser_version,extracted_count,changed_count,duration_seconds,extraction_config,review_reasons FROM pricing.runs ORDER BY created_at DESC LIMIT 100')).rows;
  const candidates=(await adminPool.query("SELECT id,provider_id,base_version,verified_at,parser_version,run_id FROM pricing.versions WHERE status='candidate' ORDER BY created_at DESC LIMIT 30")).rows;
  const estimates=(await adminPool.query("SELECT id,tariff_version,configuration,status,created_at,result-'evidence' AS result FROM pricing.estimates ORDER BY created_at DESC LIMIT 30")).rows;
  const unverifiedSubmissions=(await adminPool.query('SELECT id,provider_id,service,source_url,reported_by,source_access_status,verification_status,received_at,verified_at,data FROM pricing.unverified_tariff_submissions ORDER BY received_at DESC LIMIT 30')).rows;
  res.json({sources,runs,candidates,estimates,unverifiedSubmissions,schedule:'روزانه ۰۳:۱۵ UTC؛ worker مستقل از رایانهٔ توسعه',retention:'شاهد خام: ۳۰ روز و سقف مجموع ۱۰۰MiB؛ هش و تاریخچه باقی می‌مانند.'});
 });
 app.get('/api/admin/pricing/runs/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id),run=(await adminPool.query('SELECT * FROM pricing.runs WHERE id=$1',[id])).rows[0];
  if(!run)return res.status(404).json({error:'اجرا یافت نشد.'});
  res.json({run,evidence:(await adminPool.query('SELECT * FROM pricing.evidence_metadata WHERE run_id=$1',[id])).rows,versions:(await adminPool.query('SELECT id,status,parser_version,verified_at,plans FROM pricing.versions WHERE run_id=$1',[id])).rows});
 });
 app.post('/api/admin/pricing/sources/:id',async(req,res)=>{
  const id=providerId.parse(req.params.id),input=z.object({enabled:z.boolean()}).strict().parse(req.body);
  const result=await adminPool.query("UPDATE pricing.sources SET enabled=$1,next_run=CASE WHEN $1 AND next_run IS NULL THEN date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 day 3 hours 15 minutes' ELSE next_run END WHERE id=$2 AND adapter IN ('liara','arvan','parsvds') RETURNING id,enabled",[input.enabled,id]);
  if(!result.rowCount)return res.status(409).json({error:'adapter این منبع پیاده‌سازی نشده است.'});res.json(result.rows[0]);
 });
 app.post('/api/admin/pricing/sources/:id/run',async(req,res)=>{
  const id=providerId.parse(req.params.id),db=await adminPool.connect();
  try{
   await db.query('BEGIN');const s=(await db.query('SELECT * FROM pricing.sources WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!s?.enabled||!['liara','arvan','parsvds'].includes(s.adapter))throw Object.assign(new Error('منبع فعال یا پشتیبانی‌شده نیست.'),{status:409});
   const allowed=(await db.query("SELECT NOT EXISTS(SELECT 1 FROM pricing.runs WHERE provider_id=$1 AND (status IN ('queued','running') OR created_at>now()-interval '10 minutes')) AND NOT EXISTS(SELECT 1 FROM pricing.runs WHERE requested_by=$2 AND created_at>now()-interval '1 minute') AS ok",[id,req.session.id])).rows[0].ok;
   if(!allowed)throw Object.assign(new Error('اجرا در صف است یا محدودیت نرخ فعال است؛ بعداً تلاش کنید.'),{status:429});
   const runId=randomUUID();await db.query("INSERT INTO pricing.runs(id,provider_id,trigger,requested_by) VALUES($1,$2,'manual',$3)",[runId,id,req.session.id]);await db.query('UPDATE pricing.sources SET last_manual=now() WHERE id=$1',[id]);await db.query('COMMIT');res.status(202).json({id:runId,status:'queued'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 });
 app.post('/api/admin/pricing/review/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id),input=z.object({action:z.enum(['approve','reject']),note:z.string().min(10).max(1000)}).strict().parse(req.body),db=await adminPool.connect();
  try{
   await db.query('BEGIN');const v=(await db.query('SELECT * FROM pricing.versions WHERE id=$1',[id])).rows[0];
   if(!v||v.status!=='candidate')throw Object.assign(new Error('نسخهٔ در انتظار بررسی یافت نشد.'),{status:409});
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pricing:'+v.provider_id]);
   const fresh=(await db.query('SELECT status FROM pricing.versions WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const current=(await db.query("SELECT id FROM pricing.versions WHERE provider_id=$1 AND status='published' ORDER BY published_at DESC,id DESC LIMIT 1",[v.provider_id])).rows[0];
   if(fresh.status!=='candidate'||input.action==='approve'&&(current?.id??null)!==v.base_version)throw Object.assign(new Error('نسخهٔ مبنا تغییر کرده؛ ابتدا استخراج تازه و تفاوت جدید را بررسی کنید.'),{status:409});
   await db.query("UPDATE pricing.versions SET status=$1,reviewed_by=$2,review_note=$3,published_at=CASE WHEN $1='published' THEN now() ELSE NULL END WHERE id=$4",[input.action==='approve'?'published':'rejected',req.session.id,input.note,id]);
   await db.query('UPDATE pricing.runs SET status=$1,error_message=$2 WHERE id=$3',[input.action==='approve'?'published':'rejected',input.note,v.run_id]);
   await db.query('COMMIT');res.json({ok:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 });
}
