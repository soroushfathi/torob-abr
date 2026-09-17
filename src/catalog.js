// Reviewed public-source snapshot. Prices are evidence, not live purchase quotes.
const checkedAt = '2026-09-16';
const provider = (id, name, source, services, note, priceStatus = 'pending') =>
  ({ id, name, country: 'Iran', source, services, note, priceStatus, checkedAt });
export const providers = [
  provider('liara','لیارا','https://liara.ir/pricing/','PaaS · دیتابیس · سرور · S3','تعرفهٔ پایهٔ ماهانه؛ IPv4 سرور جدا محاسبه شده است.','priced'),
  provider('cloudir','کلاد / آسیاتک','https://cloud.ir/price-by-region/','سرور · ذخیره‌سازی · CDN','قیمت منبع ریال است؛ برای نمایش بر ۱۰ تقسیم شده است.','priced'),
  provider('iranserver','ایران‌سرور','https://www.iranserver.com/vps/iran/','سرور ابری و VPS ایران','پلن‌های کاربرد عمومی NGP؛ ۱۰۰۰ گیگابایت ترافیک درج‌شده.','priced'),
  provider('mobinhost','مبین‌هاست','https://www.mobinhost.com/','VPS ایران','فقط پلن‌های ایران؛ پلن ۲ گیگابایت ناموجود اعلام شده است.','priced'),
  provider('mizbancloud','میزبان‌کلاد','https://mizbancloud.com/server','سرور · CDN · ذخیره‌سازی','قیمت‌های «شروع از»؛ منابع پیش‌فرض ماشین‌حساب با دیسک SAS.','starting'),
  provider('parspack','پارس‌پک','https://parspack.com/cloud-server','سرور ابری · PaaS · ذخیره‌سازی','ماشین‌حساب: روزانه ۳۱٬۴۹۶ تومان؛ برای ۳۰ روز ۹۴۴٬۸۸۰ تومان. منطقهٔ این عدد مشخص نیست؛ تا تأیید ایران وارد رتبه‌بندی نمی‌شود.','partial'),
  provider('arvan','ابر آروان','https://www.arvancloud.ir/fa/pricing/iaas','سرور · کانتینر · ذخیره‌سازی · CDN','صفحهٔ تعرفه در بررسی با چالش دسترسی پاسخ داد؛ قیمت عددی تأیید نشده است.'),
  provider('hamravesh','هم‌روش / دارکوب','https://hamravesh.com/darkube','PaaS · Kubernetes · دیتابیس','صفحهٔ عمومی قابلیت‌ها را دارد؛ تعرفهٔ عددی در محتوای دریافت‌شده نبود.'),
  provider('derak','ابر دراک','https://derak.cloud/pricing/cloud-server/','سرور · VPS · CDN','API رسمی، پلن تهران استاندارد ۲GB/۲ هسته را ماهانه ۹۹۰٬۰۰۰ تومان نشان می‌دهد؛ خرید اولیه ناموجود و نمایش در صفحه غیرفعال است. به گزینه‌های قابل خرید اضافه نشده است.','partial'),
  provider('abalon','آبالون / ابر زس','https://abalon.cloud/vps','سرور ابری','عدد نمایشی ۲٬۸۰۷٬۷۷۰ تومان برای ۴ هسته، ۸GB رم و ۵۰GB دیسک؛ دورهٔ صورتحساب و منطقه کنار عدد روشن نیست. ابر زس دوباره شمرده نشده است.','partial'),
  provider('abrha','ابرها','https://abrha.com/cloud-server/iran/','سرور ابری ایران','ماشین‌حساب ایران منابع را نشان می‌دهد اما فیلد هزینه در خروجی عمومی خالی است.'),
  provider('serverir','سرور دات‌آی‌آر','https://server.ir/cloud-server/','سرور ابری','جدول تعرفه در محتوای عمومی دریافت‌شده عدد قابل اتکا نداشت.'),
  provider('ferdowsi','ابر فردوسی','https://ferdowsi.cloud/fa/services-price','سرور · زیرساخت ابری','ماشین‌حساب با منابع صفر بارگذاری شد؛ مقدار صفر قیمت سرویس واقعی نیست.'),
  provider('abramad','ابرآمد','https://www.abramad.com/services/cloud-server/','سرور · شبکه و دیسک ابری','صفحهٔ رسمی به پنل و مشاوره ارجاع می‌دهد؛ قیمت عمومی قابل استخراج نبود.'),
  provider('hostiran','هاست‌ایران','https://hostiran.net/','سرور · زیرساخت ابری','زیرساخت ابری در سایت رسمی موجود است؛ تعرفهٔ منطقهٔ ایران هنوز تأیید نشده است.'),
  provider('iranhost','ایران‌هاست','https://iranhost.com/server/cloud-server/','سرور ابری','صفحهٔ رسمی سرور ابری بررسی شد؛ پلن ایران با قیمت و منابع قابل تطبیق در این بررسی تأیید نشد.'),
  provider('sabahost','صباهاست','https://saba.host/','هاست و سرور ابری','ارائهٔ سرور ابری در سایت رسمی معرفی شده است؛ تعرفهٔ پیکربندی ایران هنوز تأیید نشده است.'),
];
const offers = [];
function server(providerId, slug, plan, amount, ram, cpu, disk, extra = {}) {
  const p = providers.find(p => p.id === providerId);
  const { currency = 'IRT', ipv4 = 0, priceKind = 'published', ...rest } = extra;
  const compute = amount / (currency === 'IRR' ? 10 : 1);
  offers.push({ id: `${providerId}-${slug}`, providerId, provider: p.name, model: 'IaaS',
    plan, region: 'Iran', currency: 'IRT', originalPrice: { amount, currency, period: 'month' },
    compute, monthly: compute + ipv4, ram, cpu, disk, priceKind,
    source: p.source, purchase: p.source, retrievedAt: checkedAt,
    components: [{ label: 'سرور؛ برنامه و دیتابیس روی همین ماشین', amount: compute },
      ...(ipv4 ? [{ label: 'IPv4', amount: ipv4 }] : [])],
    topology: 'Next.js و PostgreSQL/MySQL روی یک سرور؛ تصاویر روی دیسک همین سرور. منابع میان هر سه مشترک است.',
    responsibility: 'نصب، امنیت، به‌روزرسانی دیتابیس و بازیابی با تیم شماست؛ دیتابیس مدیریت‌شده نیست.',
    unknowns: ['بکاپ مستقل، ترافیک مازاد و مالیات در جمع پایه نیست','موجودی، SLA و ظرفیت مناسب بار واقعی پیش از خرید تأیید شود'],
    ...rest });
}
// Official monthly rates, not rounded hourly rates multiplied by an assumed month.
server('liara','jupiter','مشتری + IPv4',1050000,2,1,20,{ipv4:200000,egressPerGB:2500});
server('liara','saturn','زحل + IPv4',1900000,4,2,40,{ipv4:200000,egressPerGB:2500});
server('liara','uranus','اورانوس + IPv4',3300000,8,4,80,{ipv4:200000,egressPerGB:2500});
server('cloudir','vps-b2','AT-VPS-B2',11609500,4,2,40,{currency:'IRR',trafficGB:150});
server('cloudir','vps-g1','AT-VPS-G1',15174500,8,4,60,{currency:'IRR',trafficGB:150});
server('cloudir','vps-g2','AT-VPS-G2',27884500,16,8,120,{currency:'IRR',trafficGB:150});
server('cloudir','basic-1','ابری پایه ۱',8679600,1,1,25,{currency:'IRR'});
server('cloudir','basic-2','ابری پایه ۲',12297600,2,1,40,{currency:'IRR'});
server('cloudir','basic-3','ابری پایه ۳',22795200,4,2,80,{currency:'IRR'});
server('iranserver','ngp-small40','NGP-small40',1823999,4,1,40,{trafficGB:1000});
server('iranserver','ngp-medium40','NGP-medium40',2803199,8,2,40,{trafficGB:1000});
server('iranserver','ngp-large80','NGP-large80',4823039,16,4,80,{trafficGB:1000});
server('mobinhost','iran-2','ایران ۲GB',695000,2,1,25,{trafficGB:100,availability:'unavailable_at_retrieval'});
server('mobinhost','iran-4','ایران ۴GB',795000,4,2,40,{trafficGB:100});
server('mobinhost','iran-6','ایران ۶GB',995000,6,3,50,{trafficGB:100});
server('mizbancloud','economy','اقتصادی · SAS',765872,2,1,25,{priceKind:'starting_at'});
server('mizbancloud','business','تجاری · SAS',1451744,4,2,50,{priceKind:'starting_at'});
server('mizbancloud','professional','حرفه‌ای · SAS',2823488,8,4,100,{priceKind:'starting_at'});
for (const [slug, plan, appPrice, ram, cpu, disk] of [
  ['mars','مریخ',950000,1,1,10], ['jupiter','مشتری',1650000,2,1,20], ['saturn','زحل',2950000,4,2,40]
]) {
  const p = providers[0];
  offers.push({id:`liara-paas-${slug}`,providerId:p.id,provider:p.name,model:'PaaS',
    plan:`برنامهٔ ${plan} + دیتابیس مریخ + فایل ۲۰GB`,region:'Iran',currency:'IRT',
    originalPrice:{amount:appPrice,currency:'IRT',period:'month'},compute:appPrice,
    monthly:appPrice+950000+350000,ram,cpu,disk,dbRam:1,dbDisk:10,objectStorageGB:20,
    priceKind:'published',source:p.source,purchase:'https://console.liara.ir/',retrievedAt:checkedAt,
    components:[{label:`برنامهٔ ${plan}`,amount:appPrice},{label:'دیتابیس مریخ · ۱GB رم / ۱۰GB دیسک',amount:950000},{label:'Object Storage · ۲۰GB',amount:350000}],
    topology:'برنامه، دیتابیس و فضای تصاویر مستقل؛ سبد پیشنهادی ترب ابر از سه تعرفهٔ پایه، نه یک بستهٔ فروشنده.',
    responsibility:'زیرساخت با ارائه‌دهنده؛ امنیت برنامه، سیاست نگهداری و آزمون بازیابی با تیم شماست.',
    unknowns:['ترافیک، بکاپ موردنیاز و مالیات در جمع پایه نیست','ظرفیت DB و فضای تصاویر فرض اولیه است؛ با دادهٔ واقعی بررسی شود']});
}
export const catalog = {version:'2026-09-16.3',retrievedAt:checkedAt,retrievalPrecision:'day',
  scope:'Iranian providers, Iranian hosting only',providers,offers,
  coverageNote:'۱۷ ارائه‌دهنده بررسی شده‌اند؛ این فهرست ادعای پوشش همهٔ بازار ندارد. فقط پلن‌های دارای قیمت و محل ایران وارد مقایسه می‌شوند.'};
