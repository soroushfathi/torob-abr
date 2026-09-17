import {catalog} from './catalog.js';
export {catalog};
export {parseBudget} from './advisor/requirements.js';
export {recommend} from './advisor/recommend.js';
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
