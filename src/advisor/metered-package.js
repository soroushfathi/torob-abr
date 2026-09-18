import {budgetBand,assessBudget,hasOperationsCapability} from './requirements.js';
export function attachMeteredPackage(report,input,estimate) {
 report.serverOptions=[];
 const container=input.pricingPreference==='arvan-container',model=container?'container':'IaaS';
 const capable=hasOperationsCapability(input);
 const high=input.availability==='critical'||input.scale==='large';
 const plan=report.catalogSnapshot.tariffs.find(t=>t.providerId==='arvan'&&t.service===(container?'paas':'iaas'))||null;
 const quoteKnown=estimate.status==='quoted_requires_verification';
 const components=[];
 const add=(id,label,mode,required,reason,sharedWith=null)=>components.push({id,label,mode,required,reason,plan:null,monthly:null,sharedWith,costStatus:!required?'not-required':sharedWith?'included':'unavailable'});
 add('app','اجرای برنامه',model,true,'پیکربندی صریح با مقادیر نیازسنجی؛ حدود ماشین‌حساب بررسی می‌شوند و قابلیت سفارش نیازمند تأیید ارائه‌دهنده است.');
 components[0].plan=plan?{...plan,plan:'پیکربندی مصرفی آروان؛ پلن ثابت نیست'}:null;
 components[0].periodTotal=quoteKnown?estimate.displayToman:null;components[0].monthly=quoteKnown&&estimate.configuration.usageDays==='30'?estimate.displayToman:null;components[0].costStatus=quoteKnown?'known':'unavailable';
 add('vm','ماشین مجازی جدا',container?'none':'same-machine',!container,'هزینهٔ ماشین در ریز برآورد اجرای برنامه است؛ دوباره جمع نمی‌شود.',container?null:'app');
 add('database','دیتابیس',input.database==='none'?'none':container?'managed-external':'self-managed',input.database!=='none',container?'دیتابیس مدیریت‌شدهٔ سازگار و قیمت آن هنوز تأیید نشده است.':'روی VM مشترک؛ نصب، patch، بکاپ و بازیابی با تیم.',!container&&input.database!=='none'?'app':null);
 const selfGit=input.gitSelfHost==='yes'||['full','restricted'].includes(input.gitControl);
 add('git','میزبانی Git',selfGit?'self-hosted':'hosted',true,selfGit?'الزام کنترل/میزبانی مستقل؛ سرور و مسئول عملیات باید جدا تعیین شوند.':'Git خصوصی می‌تواند میزبانی‌شده باشد؛ پلن و قیمت تأیید نشده است.');
 add('runner','اجرای CI/CD',input.ci,input.ci!=='none','runner مستقل از Git است؛ runner خصوصی از ماشین برنامه جدا باشد.');
 add('media','فایل و رسانه',input.media==='none'?'none':'object',input.media!=='none','دادهٔ مهم به مخزن پایدار مستقل و سیاست بکاپ نیاز دارد؛ دیسک موقت کانتینر محل نگهداری آن نیست.');
 add('persistent','فضای پایدار برنامه',container?'volume':'ssd',true,'حجم صریح دیسک در برآورد ماشین‌حساب است؛ جایگزین قیمت Object Storage نیست.','app');
 add('ephemeral','دیسک موقت کانتینر',container?'ephemeral':'none',container,'دیسک موقت فقط برای اجرای برنامه است و با volume پایدار یکی نیست.',container?'app':null);
 add('logs','لاگ',input.logs==='none'?'none':container?'capability-review':'team',input.logs!=='none',container?'ابتدا قابلیت و retention لاگ واقعی سرویس بررسی شود؛ سرویس تکراری خودکار افزوده نمی‌شود.':'نگهداری، محدودیت حجم و چرخش لاگ با تیم است.',input.logs!=='none'?'app':null);
 add('backup','بکاپ مستقل','independent',input.database!=='none'||input.media!=='none'&&input.mediaImportance!=='replaceable','سیاست نگهداری و بازیابی مستقل؛ Object Storage یا snapshot تنها معادل بکاپ کامل نیست.');
 add('support','DevOps و پشتیبانی','quote-required',input.supportLevel!=='none','سطح منتخب، نفر/ساعت و هزینهٔ یک‌باره/دوره‌ای جداست؛ دامنهٔ قرارداد باید بررسی شود.');
 add('ha','افزونگی و توازن بار','review',high,'تعداد نمونه به‌تنهایی HA را اثبات نمی‌کند؛ معماری، failover و SLA باید تأیید شوند.');
 const knownTotal=quoteKnown?estimate.displayToman:null;
 const knownMonthly=estimate.configuration.usageDays==='30'?knownTotal:null,band=budgetBand(input);
 const budgetStatus=assessBudget(knownMonthly,band),insufficient=budgetStatus==='insufficient';
 const blockers=[...(estimate.errors||[]),...(estimate.warnings||[]),'نرخ‌های API فقط برای همین مصرف، منطقه، کلاس و مدت معتبرند؛ قیمت واحد از آن‌ها استنتاج نشده است.'];
 if(!capable)blockers.push(container?'قابلیت‌های مدیریت‌شدهٔ کانتینر برای تیم بدون DevOps تأیید نشده‌اند؛ PaaS مدیریت‌شده را بررسی کنید.':'این انتخاب IaaS با توان عملیات تیم تأیید نشده است؛ مسئول نگهداری لازم است.');
 if(high)blockers.push('بسته برای بار بزرگ یا دسترس‌پذیری حساس تأیید نشده است.');
 if(insufficient)blockers.push('بودجه حتی هزینهٔ معلوم این پیکربندی را پوشش نمی‌دهد؛ افزایش بودجه یا کاهش دامنه لازم است.');
 const prior=report.packageSnapshot;
 const componentRules={app:'METERED-001',vm:'METERED-001',database:'DB-001',git:'GIT-001',runner:'CI-001',persistent:'METERED-001',ephemeral:'METERED-001',media:'MEDIA-001',logs:'LOG-001',backup:'BACKUP-001',support:'SUPPORT-001',ha:'CAP-001'};
 const componentDecisions=components.filter(c=>!['METERED-001','SUPPORT-001'].includes(componentRules[c.id])).map(c=>({id:componentRules[c.id],inputs:{database:input.database,operationsCapability:input.operationsCapability??null,devops:input.devops,media:input.media,mediaImportance:input.mediaImportance,gitPrivate:input.gitPrivate,gitSelfHost:input.gitSelfHost,gitControl:input.gitControl,ci:input.ci,logs:input.logs,logRetentionDays:input.logRetentionDays,availability:input.availability},result:c.mode,reason:c.reason,assumptions:[]}));
 for(const c of components)c.ruleId=componentRules[c.id];
 report.packageSnapshot={...prior,id:'package-primary',title:container?'بستهٔ کانتینر آروان با تعرفهٔ مصرفی':'بستهٔ ماشین آروان با تعرفهٔ مصرفی',model,components,knownMonthly,knownTotal,estimateComplete:false,budgetStatus:insufficient?'insufficient':knownMonthly===null?'unknown':'unconfirmed',status:insufficient?'ineligible':'requires_verification',
  assumptions:[...estimate.configuration.assumptions,'تمام مقادیر پیکربندی از همین نیازسنجی‌اند؛ وضعیت صفحه یا حساب کاربر استفاده نشده است.','قیمت‌ها در ارز اصلی نگه داشته می‌شوند؛ نمایش تومان با تقسیم ریال بر ۱۰ است.'],
  unknowns:['مالیات، بکاپ، نگهداری انسانی، Git و CI در جمع معلوم نیستند.',...(estimate.unknowns||[]),...components.filter(c=>c.required&&c.costStatus==='unavailable').map(c=>`قیمت ${c.label} ناموجود است.`)],blockers,estimate,
  decisions:[{id:'METERED-001',inputs:estimate.configuration,result:estimate.status,reason:'انتخاب صریح سرویس مصرفی؛ ابتدا ساخت پیکربندی، سپس کنترل حدود و محاسبهٔ همان پیکربندی.',assumptions:estimate.configuration.assumptions},{id:'SUPPORT-001',inputs:{level:input.supportLevel,hours:input.supportHours,people:input.supportPeople,billing:input.supportBilling},result:input.supportLevel==='none'?'not-selected':'requires-quote',reason:'نبود DevOps مجوز خرید همهٔ سطوح پشتیبانی نیست؛ فقط سطح انتخاب‌شده بررسی می‌شود.',assumptions:['پشتیبانی قراردادی معادل مدیریت کامل زیرساخت فرض نشده است.']}],
  topology:container?'کاربر ← کانتینر؛ برنامه ↔ volume پایدار / دیتابیس مستقل؛ فایل ↔ Object Storage؛ بکاپ ← مقصد مستقل؛ Git → CI → انتشار':'کاربر ← برنامه روی VM ↔ دیتابیس مشترک؛ دیسک/IP/ترافیک در برآورد VM؛ فایل ↔ مخزن مستقل؛ بکاپ ← مقصد مستقل',
  responsibilities:{team:'امنیت برنامه، تنظیمات، اسرار، دسترسی‌ها و سیاست بازیابی با تیم است. '+(!container?'عملیات سیستم‌عامل و دیتابیس مشترک هم با تیم است.':'دامنهٔ مدیریت کانتینر باید طبق قرارداد تعیین شود.'),provider:'منابع و خدمات در دامنهٔ قرارداد؛ پشتیبانی خریداری‌شده به‌تنهایی مدیریت کامل را تضمین نمی‌کند.'}};
 // Keep only one meaningful managed alternative when the explicit metered option needs operations support.
 report.alternative=!capable&&prior.model==='PaaS'?{...prior,id:'package-managed-alternative'}:null;
 report.packageSnapshot.providerId='arvan';
 delete report.packageSnapshot.serverChoice;
 report.packageSnapshot.budgetStatus=budgetStatus;
 report.packageSnapshot.decisions.push(...componentDecisions,{id:'BUDGET-001',inputs:{budgetBand:band,knownMonthly,usageDays:estimate.configuration.usageDays},result:budgetStatus,reason:'فقط بازهٔ صریح ۳۰روزه با سقف بازهٔ بودجهٔ ماهانه مقایسه می‌شود؛ جمع هزینه کامل نیست.',assumptions:['۱۰ میلیون به بالا سقف مشخص ندارد و بودجهٔ نامحدود فرض نمی‌شود.']});
 report.model=report.packageSnapshot.title;report.status=report.packageSnapshot.status;report.assumptions=report.packageSnapshot.assumptions;report.unknowns=report.packageSnapshot.unknowns;
}
