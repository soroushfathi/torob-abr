export const catalog = {
 version:'2026-09-16.1', retrievedAt:'2026-09-16', retrievalPrecision:'day',
 offers:[
  {id:'liara',provider:'لیارا',model:'PaaS',plan:'میزبانی Node.js + PostgreSQL + Object Storage',region:'Iran',currency:'IRT',compute:null,ram:null,cpu:null,source:'https://liara.ir/pricing',purchase:'https://console.liara.ir/',unknowns:['قیمت پلن و منابع در صفحهٔ پویا قابل استخراج نبود','ظرفیت، پشتیبان‌گیری و ترافیک باید بررسی شود']},
  {id:'hetzner',provider:'Hetzner',model:'IaaS',plan:'CX23 + PostgreSQL self-managed',region:'EU',currency:'EUR',compute:null,ram:4,cpu:2,availability:'unavailable_at_retrieval',source:'https://www.hetzner.com/cloud/cost-optimized/',purchase:'https://console.hetzner.com/',unknowns:['در زمان بررسی، صفحهٔ رسمی محصول را ناموجود نشان می‌داد','قیمت جاری وابسته به محل و مالیات؛ نیازمند تأیید سبد خرید','دسترسی خرید از ایران و پرداخت باید تأیید شود','فضای فایل و پشتیبان خارج از سرور قیمت‌گذاری نشده']},
  {id:'render',provider:'Render',model:'PaaS',plan:'0.5c-512mb + managed PostgreSQL',region:'outside-Iran',currency:'USD',compute:null,ram:0.5,cpu:0.5,source:'https://render.com/docs/compute-plans',purchase:'https://dashboard.render.com/',unknowns:['قیمت compute و دیتابیس باید در سبد خرید تأیید شود','فضای فایل مستقل و هزینهٔ ترافیک نیازمند بررسی','دسترسی خرید از ایران باید تأیید شود']}
 ]
};
export function recommend(requirements, now=Date.now()) {
 const stale=now-Date.parse(catalog.retrievedAt)>7*86400000;
 const model=requirements.operations==='experienced'?'IaaS':'PaaS / Hybrid';
 const options=catalog.offers.map(offer=>{
  const reasons=[];
  if(offer.availability==='unavailable_at_retrieval') reasons.push('در زمان بررسی موجودی تأیید نشده است');
  if(requirements.region==='Iran' && offer.region!=='Iran') reasons.push('الزام میزبانی در ایران رعایت نمی‌شود');
  if(requirements.database!=='PostgreSQL') reasons.push('این کاتالوگ محدود فقط PostgreSQL را ارزیابی می‌کند');
  const status=reasons.length?'ineligible':'requires_verification';
  return {...offer,status,reasons,stale};
 }).sort((a,b)=>(a.status==='ineligible')-(b.status==='ineligible')||((a.model==='PaaS')? -1:1));
 return {model,status:options.every(o=>o.status==='ineligible')?'ineligible':'requires_verification',eligibleCount:0,estimateComplete:false,catalogVersion:catalog.version,catalogSnapshot:catalog,options,
 explanation:model==='IaaS'?'تیم توان نگهداری دارد؛ مدیریت سیستم‌عامل، امنیت و بازیابی بر عهدهٔ تیم باقی می‌ماند.':'برای تیم کوچک، میزبانی مدیریت‌شده همراه دیتابیس و ذخیره‌سازی مستقل نقطهٔ شروع مناسبی است؛ مسئولیت صحت بکاپ و تنظیمات همچنان با تیم است.',
 assumptions:['اندازهٔ اولیه موقت است و از تعداد کاربران CPU/RAM استنتاج نشده','قبل از خرید، تست بار با دادهٔ نماینده و بررسی p95، خطا، RAM و I/O لازم است'],
 unknowns:['بدون قیمت کامل و تأیید الزامات مهم، هیچ گزینه‌ای تأییدشده محسوب نمی‌شود','هزینهٔ نیروی انسانی و تبدیل ارز اعمال نشده']};
}
export function reportIncident(kind, payload) {
 const evidence=payload?.evidence||[];
 const value=name=>{const v=evidence.find(x=>x.name===name)?.result?.[0]?.value?.[1];return v===undefined||!Number.isFinite(Number(v))?null:Number(v);};
 const online=value('online')===1;
 const required={latency:['requests_per_second','error_ratio','latency_p95_seconds'],resources:['cpu_ratio','rss_bytes'],database:['local_database_up','analytics_database_up']}[kind];
 const enough=online&&required.every(x=>value(x)!==null);
 let unhealthy=false;
 if(enough) unhealthy=kind==='database'?value('local_database_up')===0||value('analytics_database_up')===0:kind==='latency'?value('error_ratio')>0.05||value('latency_p95_seconds')>1:value('cpu_ratio')>0.8||value('rss_bytes')>512*1024*1024;
 return {kind,resource:'torob-cloud-local',status:!payload?'integration_unavailable':!enough?'inconclusive':unhealthy?'unhealthy':'healthy',sufficientEvidence:enough,evidence,
 observedAt:new Date().toISOString(),window:payload?.window||'unavailable',
 symptoms:!online?'رایانهٔ توسعه آفلاین است یا دادهٔ تازه دریافت نشده':unhealthy?'عبور از آستانهٔ اولیهٔ بررسی':'در اندازه‌گیری فعلی عبور از آستانه دیده نشد',
 hypotheses:!enough?['دادهٔ کافی برای تشخیص نداریم؛ اتصال تونل و زمان آخرین دریافت را بررسی کنید']:unhealthy?['فشار بار یا محدودیت منابع می‌تواند مرتبط باشد؛ علت قطعی اثبات نشده']:['شواهد فعلی محدود به برنامهٔ محلی است؛ سلامت تولید از آن نتیجه نمی‌شود'],
 missingEvidence:['trace و لاگ اختصاصی برنامه متصل نیست','baseline و بار نماینده برای توصیهٔ تغییر ظرفیت کافی نیست'],
 remediation:'فقط پیشنهاد: تونل، health و روند ۱۵ دقیقه‌ای را بررسی کنید. هیچ تغییری اجرا نشد.',
 verification:['GET /api/health','تکرار همین پرس‌وجوهای محدود پس از جمع‌آوری نمونه‌های بیشتر'],
 timeline:[{at:new Date().toISOString(),event:'bounded_read_only_investigation_completed'}]};
}
