import {decide,RULES_VERSION} from './rules.js';
import {requirementsSchema,assessBudget} from './requirements.js';
import {catalog} from '../catalog.js';
import {seedTariffs} from '../pricing/catalog-store.js';
import {compare,sum} from '../pricing/decimal.js';
const labels={app:'اجرای برنامه',vm:'ماشین مجازی جدا',database:'دیتابیس',git:'میزبانی Git',runner:'اجرای CI/CD',media:'فایل و رسانه',logs:'لاگ',backup:'بکاپ مستقل',ha:'افزونگی و توازن بار'};
function build(r,cat,now,override) {
 const d=decide(r,override),components=[],assumptions=d.decisions.flatMap(x=>x.assumptions),blockers=[];
 const valid=p=>p.priceKind==='published'&&p.region==='Iran'&&p.period==='month'&&p.currency==='IRT'&&p.monthly!==null&&Number.isFinite(Number(p.monthly))&&Number(p.monthly)>0&&!['unavailable','unavailable_at_retrieval'].includes(p.availability)&&Number.isFinite(Date.parse(p.verifiedAt))&&now-Date.parse(p.verifiedAt)>=0&&now-Date.parse(p.verifiedAt)<=7*86400000;
 const pick=(service,filter=()=>true)=>(cat.tariffs||[]).filter(p=>p.service===service&&valid(p)&&filter(p)).sort((a,b)=>compare(a.monthly,b.monthly)||a.id.localeCompare(b.id,'en'))[0]||null;
 const add=(id,mode,required,reason,plan=null,sharedWith=null)=>{const c={id,label:labels[id],mode,required,reason,plan,sharedWith,monthly:plan?.monthly??null,costStatus:!required?'not-required':sharedWith?'included':plan?'known':'unavailable'};components.push(c);return c;};
 // A single provider avoids assuming cross-provider private networks or compatible managed regions.
 const appPlan=pick(d.model==='IaaS'?'iaas':'paas',p=>p.ram>=(d.model==='IaaS'?4:1));
 add('app',d.model,true,d.model==='IaaS'?'ماشین اجاره‌ای؛ نگهداری سیستم‌عامل و برنامه با تیم.':'زیرساخت اجرای برنامه با ارائه‌دهنده؛ تنظیمات و امنیت برنامه با تیم.',appPlan);
 add('vm',d.model==='IaaS'?'shared-app':'none',d.model==='IaaS','ماشین اجرای برنامه همان هزینهٔ ردیف اول است؛ VM دیگری برای اجرای برنامه محاسبه نمی‌شود.',null,d.model==='IaaS'?'app':null);
 if(d.model==='IaaS'&&appPlan){
  components.push({id:'ipv4',label:'IPv4 ماشین',mode:'network',required:true,reason:'هزینهٔ IP جدا از اجارهٔ ماشین نگه داشته شده است.',plan:null,sharedWith:appPlan.ipv4Included?'app':null,monthly:appPlan.ipv4Monthly??null,costStatus:appPlan.ipv4Included?'included':Number.isFinite(appPlan.ipv4Monthly)?'known':'unavailable'});
 }
 const knownDb=['PostgreSQL','MySQL'].includes(r.database);
 add('database',r.database==='none'?'none':d.shared?'self-managed':'managed',r.database!=='none',d.shared?'دیتابیس روی ماشین برنامه؛ ارتقا، امنیت و بکاپ با تیم.':'دیتابیس مستقل؛ دامنهٔ بکاپ و بازیابی سرویس باید تأیید شود.',!d.shared&&knownDb&&appPlan?pick('dbaas',p=>p.providerId===appPlan.providerId&&p.region===appPlan.region&&p.ram>=1):null,d.shared&&r.database!=='none'?'app':null);
 add('git',d.git,true,d.git==='hosted'?'پیش‌فرض سرویس میزبانی Git است؛ پلن خصوصی و محدودیت دسترسی پیش از انتخاب تأیید شوند.':'کنترل یا میزبانی مستقل لازم است؛ سرور مستقل و مسئول عملیات باید تعیین شوند.');
 add('runner',d.runner,r.ci!=='none',r.ci==='private-runner'?'runner خصوصی جدا از برنامه و Git؛ محدودیت منابع و جداسازی build لازم است.':'runner میزبانی‌شده مستقل از Git است؛ سهمیه و هزینه هنوز تأیید نشده است.');
 const capacity=d.gb!==null&&d.growth!==null?d.gb+3*d.growth:null;
 add('media',d.media,d.media!=='none',d.media==='disk'?'فایل قابل جایگزینی روی دیسک ماشین؛ منابع با برنامه و دیتابیس مشترک‌اند.':'فایل پایدار در Object Storage؛ منطقه، دسترسی S3 و سیاست بازیابی باید تطبیق داده شوند.',d.media==='object'&&appPlan&&capacity!==null?pick('object',p=>p.providerId===appPlan.providerId&&p.region===appPlan.region&&p.capacityGB>=capacity):null,d.media==='disk'?'app':null);
 add('logs',d.logs,d.logs!=='none',d.logs==='included-pending'?'سرویس تکراری پیشنهاد نشده؛ ابتدا مدت نگهداری، حجم و جست‌وجوی لاگ PaaS تأیید شود.':d.logs==='team'?'چرخش و سقف حجم لاگ روی ماشین با تیم؛ retention و جست‌وجو هنوز نیازمند ظرفیت‌سنجی است.':'سرویس مدیریت‌شدهٔ لاگ نیاز است؛ قیمت معتبر در دسترس نیست.',null,['team','included-pending'].includes(d.logs)?'app':null);
 const backup=r.database!=='none'||r.media!=='none'&&r.mediaImportance!=='replaceable';
 d.decisions.push({id:'BACKUP-001',inputs:{database:r.database,media:r.media,mediaImportance:r.mediaImportance},result:backup?'independent-required':'not-required',reason:'دادهٔ پایدار مهم به نسخهٔ مستقل و سیاست بازیابی نیاز دارد.',assumptions:['Object Storage به‌تنهایی بکاپ نیست.']});
 add('backup','independent',backup,'نسخهٔ مستقل خارج از ماشین/مخزن اصلی، زمان نگهداری، RPO/RTO و مسئول بازیابی مشخص شوند. Object Storage به‌تنهایی بکاپ نیست.');
 add('ha','multi-instance',d.high,'برای بار بزرگ یا دسترس‌پذیری حساس، replica، failover و load balancer نیازمند طراحی و قیمت مستقل هستند.');
 if(d.high)blockers.push('بستهٔ حداقلی تک‌نمونه مناسب نیاز حساس یا مقیاس بزرگ تأیید نشده؛ طراحی افزونگی و ظرفیت لازم است.');
 if(d.git==='self-hosted'&&!d.capable)blockers.push('Git مستقل بدون مسئول عملیات مشخص قابل توصیهٔ نهایی نیست؛ نیاز به مسئول یا سرویس دارای پشتیبانی دارد.');
 if(r.ci==='private-runner'&&!d.capable)blockers.push('runner خصوصی مسئول عملیات و جداسازی امنیتی می‌خواهد.');
 if(!/^(next\.?js|node\.?js)$/i.test(r.stack.trim()))blockers.push('سازگاری فناوری برنامه با پلن‌های فعلی تأیید نشده است.');
 if(!knownDb&&r.database!=='none')blockers.push('نوع یا پشتیبانی دیتابیس باید تأیید شود؛ پلن مدیریت‌شدهٔ نامرتبط تخصیص داده نشده است.');
 const amounts=components.filter(c=>c.required&&!c.sharedWith&&c.monthly!==null&&Number.isFinite(Number(c.monthly))).map(c=>String(c.monthly));
 const knownMonthly=amounts.length?sum(amounts):null;
 const budgetStatus=assessBudget(knownMonthly,d.band);
 d.decisions.push({id:'BUDGET-001',inputs:{budgetBand:d.band,knownMonthly},result:budgetStatus,reason:'جمع معلوم با سقف بازه مقایسه می‌شود؛ هزینهٔ زیر سقف بازه به معنی کفایت بودجه نیست.',assumptions:['هزینه‌های مجهول در جمع وارد نشده‌اند.','بازهٔ ۱۰ میلیون به بالا سقف مشخص ندارد؛ توان پرداخت نامحدود فرض نمی‌شود.']});
 if(budgetStatus==='insufficient')blockers.push('بودجه حتی برای هزینه‌های معلوم بستهٔ حداقلی کافی نیست؛ دامنه را کاهش دهید یا بودجه را افزایش دهید.');
 const unknowns=['مالیات، ترافیک مصرفی و مازاد، هزینهٔ نگهداری انسانی و بازیابی در جمع معلوم نیستند.',...components.filter(c=>c.required&&c.costStatus==='unavailable').map(c=>`قیمت معتبر ${c.label} ناموجود است.`)];
 if(d.logs==='included-pending')unknowns.push('کفایت لاگ داخلی PaaS هنوز با retention و جست‌وجوی درخواستی تطبیق قطعی نشده است.');
 if(capacity===null&&d.media!=='none')unknowns.push('حجم یا رشد رسانه نامشخص است؛ پلن فضای ذخیره‌سازی انتخاب نشده است.');
 assumptions.push('منابع ۱GB برنامه/DB یا VM حداقل ۴GB صرفاً نقطهٔ شروع بررسی‌اند؛ ظرفیت بار واقعی تضمین نشده است.','یک منطقه و ارائه‌دهنده برای سرویس‌های مدیریت‌شده ترجیح داده شده؛ شبکهٔ خصوصی، runtime و نسخهٔ DB باید در پنل تأیید شوند.');
 const ruleIds={app:'RUN-001',vm:'RUN-001',ipv4:'RUN-001',database:'DB-001',git:'GIT-001',runner:'CI-001',media:'MEDIA-001',logs:'LOG-001',backup:'BACKUP-001',ha:'CAP-001'};
 for(const c of components)c.ruleId=ruleIds[c.id];
 return {id:override?'package-managed-alternative':'package-primary',providerId:appPlan?.providerId??null,title:d.model==='IaaS'?'بستهٔ ماشین مشترک با مدیریت تیم':'بستهٔ اجرای مدیریت‌شده',model:d.model,status:budgetStatus==='insufficient'?'ineligible':'requires_verification',budgetStatus,knownMonthly,estimateComplete:false,components,decisions:d.decisions,assumptions,unknowns,blockers,
  topology:d.model==='IaaS'?'کاربر ← برنامه روی VM ↔ دیتابیس مشترک؛ فایل ↔ دیسک یا S3؛ بکاپ ← مقصد مستقل؛ CI → انتشار کنترل‌شده روی برنامه':'کاربر ← PaaS ↔ دیتابیس مدیریت‌شده؛ فایل ↔ S3؛ لاگ ← PaaS؛ بکاپ ← مقصد مستقل؛ Git → CI → PaaS',
  responsibilities:{team:'امنیت برنامه، تنظیمات، دسترسی‌ها، اسرار، سیاست نگهداری و بازیابی با تیم است.'+(d.model==='IaaS'?' سیستم‌عامل، دیتابیس، patch و پایش منابع مشترک نیز با تیم است.':' تیم فول‌استک می‌تواند بیشتر روی برنامه تمرکز کند.'),provider:d.model==='IaaS'?'زیرساخت فیزیکی و ماشین طبق قرارداد؛ اجارهٔ ماهانه همچنان پرداخت می‌شود.':'زیرساخت و سرویس مدیریت‌شده در حدود قرارداد؛ SLA، بکاپ و retention باید بررسی شوند.'},
  checklist:['تأیید فناوری، نسخهٔ DB، منطقه، موجودی و قیمت هر جزء در منبع رسمی','ثبت بار تقریبی و مصرف دیسک، تعیین ظرفیت متناسب و حاشیهٔ رشد','تعیین مسئول دسترسی‌ها، به‌روزرسانی‌ها و بازیابی','تعیین RPO/RTO، مقصد مستقل بکاپ و نگهداری فایل مهم','تطبیق لاگ داخلی با retention و نیاز جست‌وجو قبل از افزودن سرویس','بررسی هزینهٔ ترافیک، مالیات، Git و سهمیهٔ CI قبل از خرید','شروع تدریجی بعد از رفع محدودیت‌ها و تأیید بودجه؛ خرید یا استقرار خودکار انجام نمی‌شود.']};
}
export function recommend(input, now=Date.now(), currentCatalog={...catalog,tariffs:seedTariffs()}) {
 const r=requirementsSchema.parse(input),primary=build(r,currentCatalog,now),d=decide(r);
 const alternative=d.model==='IaaS'?build(r,currentCatalog,now,'PaaS'):null;
 return {schemaVersion:2,rulesVersion:RULES_VERSION,catalogVersion:currentCatalog.version,generatedAt:new Date(now).toISOString(),requirements:r,
  catalogSnapshot:structuredClone(currentCatalog),packageSnapshot:primary,alternative,model:primary.title,status:primary.status,budget:d.budget,budgetBand:d.band,
  eligibleCount:0,candidateCount:primary.status==='ineligible'?0:1,estimateComplete:false,options:[],assumptions:primary.assumptions,unknowns:primary.unknowns};
}
