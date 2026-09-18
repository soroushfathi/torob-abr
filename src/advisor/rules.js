import {numberInput,parseBudget,budgetBand,hasOperationsCapability} from './requirements.js';
export const RULES_VERSION='packages-1.2.0';
export function decide(r, override) {
 const decisions=[];
 const record=(id,keys,result,reason,assumptions=[])=>{decisions.push({id,inputs:Object.fromEntries(keys.map(k=>[k,r[k]??'unknown'])),result,reason,assumptions});return result;};
 const capable=hasOperationsCapability(r);
 const budget=r.budgetRange===undefined?parseBudget(r.budget):null,band=budgetBand(r), high=r.availability==='critical'||r.scale==='large';
 const teamKeys=r.operationsCapability===undefined?['devops','serverMaintenance','databaseMaintenance']:['operationsCapability'];
 const model=record('RUN-001',[...teamKeys,'budgetRange','budget','availability','scale'],override||(capable&&!high?'IaaS':'PaaS'),
  override?'جایگزین مدیریت‌شده برای کاهش عملیات تیم.':capable&&!high?'توان DevOps اعلام شده است؛ اجرای برنامه و دیتابیس روی یک VM نقطهٔ شروع کم‌هزینه است. مسئولیت نگهداری دیتابیس و بازیابی باید به همان تیم سپرده شود. اجارهٔ VM حذف نمی‌شود.':high?'دسترس‌پذیری حساس یا مقیاس بزرگ به طراحی چندنمونه‌ای نیاز دارد؛ بستهٔ تک‌ماشین توصیه نمی‌شود.':'توان نگهداری سرور و دیتابیس تأیید نشده است؛ PaaS و دیتابیس مدیریت‌شده فعلاً ترجیح دارند.',
  ['PaaS امنیت برنامه، دسترسی‌ها و سیاست بازیابی را از مسئولیت تیم خارج نمی‌کند.']);
 const shared=record('DB-001',['database',...teamKeys,'availability'],model==='IaaS'&&!high,'در IaaS کم‌هزینه، دیتابیس روی ماشین مشترک با مسئولیت تیم است؛ در PaaS دیتابیس مستقل مدیریت‌شده ترجیح دارد.',['ماشین مشترک منابع و نقطهٔ خرابی مشترک دارد؛ بکاپ باید خارج از ماشین باشد.']);
 const git=record('GIT-001',['gitPrivate','gitSelfHost','gitControl'],r.gitSelfHost==='yes'||['restricted','full'].includes(r.gitControl)?'self-hosted':'hosted',
  'Git خصوصی به‌تنهایی سرور اختصاصی نمی‌خواهد؛ فقط الزام میزبانی مستقل، کنترل یا محدودیت دسترسی آن را توجیه می‌کند.');
 const runner=record('CI-001',['ci'],r.ci,'Git hosting و CI runner مستقل‌اند؛ runner خصوصی به‌دلیل اجرای کد build از ماشین برنامه جدا می‌شود.');
 const gb=numberInput(r.mediaGB),growth=numberInput(r.mediaGrowthGB);
 const media=record('MEDIA-001',['media','mediaGB','mediaGrowthGB','mediaImportance'],r.media==='none'?'none':model==='IaaS'&&gb!==null&&growth!==null&&gb+3*growth<=10&&r.mediaImportance==='replaceable'?'disk':'object',
  'دیسک مشترک فقط برای دادهٔ کم‌حجم، کم‌رشد و قابل جایگزینی در یک VM بررسی می‌شود؛ فایل پایدار در PaaS به فضای مستقل می‌رود.',
  ['افق برآورد فضا سه ماه است؛ فضای سیستم و دیتابیس باید جدا لحاظ شود.','Object Storage معادل بکاپ نیست؛ نسخه‌بندی، نسخهٔ مستقل و سیاست بازیابی برای فایل مهم لازم است.']);
 const logs=record('LOG-001',['logs','logRetentionDays','logGB','paasLogsSufficient'],r.logs==='none'?'none':model==='PaaS'?(r.paasLogsSufficient==='no'?'managed':'included-pending'):'team',
  'در PaaS ابتدا retention، حجم و جست‌وجوی لاگ داخلی تأیید می‌شود؛ فقط در صورت ناکافی بودن سرویس مستقل لازم است.',
  r.paasLogsSufficient==='yes'?['کفایت لاگ PaaS اعلام کاربر است و باید با پلن منتخب تطبیق داده شود.']:['ظرفیت و مدت نگهداری لاگ داخلی از کاتالوگ تأیید نشده است.']);
 record('CAP-001',['stage','scale','requestsPerSecond','concurrency','traffic','stack'],high?'architecture-review':'provisional',
  'ظرفیت قطعی از تعداد کاربران استخراج نمی‌شود. منابع پلن فقط نقطهٔ شروع بررسی‌اند؛ بار، فناوری و SLA باید تأیید شوند.',
  ['برای بار بزرگ یا دسترس‌پذیری حساس، بستهٔ تک‌ماشین یا تک‌نمونه کافی فرض نمی‌شود.']);
 return {model,shared,git,runner,media,logs,gb,growth,budget,band,high,capable,decisions};
}
