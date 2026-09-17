const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = v => Number(v).toLocaleString('fa-IR');
const money = v => `${n(v)} تومان`;
export function renderCatalog(root, r, {onSelect, onRefresh, currentVersion}) {
  if (r.catalogVersion !== currentVersion) {
    root.innerHTML = `<div class="panel"><h2>مقایسهٔ ذخیره‌شده نیاز به به‌روزرسانی دارد</h2><p>این پروژه با کاتالوگ قدیمی ساخته شده است. برای دیدن سرویس‌های ایران و قیمت‌های بررسی‌شده، نیازهای همین پروژه را دوباره مقایسه کنید. انتخاب قبلی پس از به‌روزرسانی پاک می‌شود.</p><button class="primary" id="refresh-catalog">مقایسه با قیمت‌های جدید</button></div><div id="checklist"></div>`;
    root.querySelector('#refresh-catalog').onclick = onRefresh;
    return;
  }
  const providers = r.catalogSnapshot.providers;
  const priced = new Set(r.options.map(o=>o.providerId)).size;
  root.innerHTML = `
    <div class="panel catalog-heading">
      <span class="eyebrow">انتخاب زیرساخت / ۰۲ · فقط میزبانی ایران</span>
      <h2>${esc(r.model)}</h2><p>${esc(r.explanation)}</p>
      <div class="catalog-stats"><div><strong>${n(providers.length)}</strong><span>ارائه‌دهنده بررسی‌شده</span></div><div><strong>${n(r.options.length)}</strong><span>پلن و سبد دارای قیمت</span></div><div><strong>${n(priced)}</strong><span>ارائه‌دهنده با قیمت قابل مقایسه</span></div></div>
      <p class="catalog-date">بررسی منابع: <bdi>${esc(r.catalogSnapshot.retrievedAt)}</bdi> · قیمت خرید لحظه‌ای نیست · منابع هر ردیف در دسترس‌اند</p>
      <p class="callout">${esc(r.unknowns.join(' · '))}</p>
      <details><summary>مبنای هزینه و فرض‌های این مقایسه</summary><ul>${r.assumptions.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p>جمع پایهٔ PaaS شامل برنامه، دیتابیس و فایل است. جمع پایهٔ IaaS شامل سرور مشترک است؛ فضای مستقل تصاویر و بکاپ اضافه نشده‌اند. ظرفیت و سطح مدیریت این دو یکسان نیست.</p></details>
      <p>${r.budget===null?'سقف بودجهٔ عددی مشخص نشده است.':`بودجهٔ ماهانه: ${money(r.budget)}؛ قرار گرفتن قیمت پایه زیر بودجه به معنی کفایت بودجهٔ نهایی نیست.`}</p>
    </div>
    <div class="catalog-toolbar">
      <label>جست‌وجو<input id="offer-search" type="search" placeholder="نام ارائه‌دهنده یا پلن"></label>
      <label>ارائه‌دهنده<select id="provider-filter"><option value="">همهٔ ارائه‌دهندگان قیمت‌دار</option>${providers.filter(p=>r.options.some(o=>o.providerId===p.id)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>نوع راهکار<select id="model-filter"><option value="">همه</option><option value="PaaS">برنامه + دیتابیس مدیریت‌شده</option><option value="IaaS">سرور با مدیریت تیم</option></select></label>
      <label>مرتب‌سازی<select id="offer-sort"><option value="fit">تناسب با توان تیم</option><option value="price">جمع پایه از کم به زیاد</option><option value="ram">حافظه از کم به زیاد</option></select></label>
    </div>
    <div class="section-heading"><h3>گزینه‌های قابل بررسی</h3><span id="offer-count" role="status"></span></div>
    <div id="catalog-results"></div>
    <div class="panel coverage"><h2>پوشش بازار ایران</h2><p>${esc(r.catalogSnapshot.coverageNote)}</p><p>سرویس‌های زیر حذف نشده‌اند؛ وضعیت دقیق استخراج قیمت برای هرکدام ثبت شده است. نداشتن عدد در این کاتالوگ به معنی رایگان بودن یا نداشتن تعرفه نیست.</p><div class="coverage-grid">${providers.map(p=>`<article><div class="coverage-title"><h3>${esc(p.name)}</h3><span class="badge ${['priced','starting'].includes(p.priceStatus)?'priced':''}">${esc({priced:'تعرفه ثبت شده',starting:'قیمت شروع',partial:'بخشی از تعرفه',pending:'قیمت تأیید نشده',unreachable:'دسترسی تأیید نشده'}[p.priceStatus])}</span></div><p>${esc(p.services)}</p><p>${esc(p.note)}</p><a href="${esc(p.source)}" target="_blank" rel="noreferrer">منبع رسمی ↗</a></article>`).join('')}</div></div>
    <div id="checklist"></div>`;
  const update = () => {
    const search=root.querySelector('#offer-search').value.trim().toLocaleLowerCase();
    const provider=root.querySelector('#provider-filter').value, model=root.querySelector('#model-filter').value, sort=root.querySelector('#offer-sort').value;
    const options=r.options.filter(o=>(!provider||o.providerId===provider)&&(!model||o.model===model)&&`${o.provider} ${o.plan}`.toLocaleLowerCase().includes(search));
    if(sort==='price')options.sort((a,b)=>a.monthly-b.monthly);
    if(sort==='ram')options.sort((a,b)=>a.ram-b.ram||a.monthly-b.monthly);
    root.querySelector('#offer-count').textContent=`${n(options.length)} نتیجه از ${n(r.options.length)}`;
    root.querySelector('#catalog-results').innerHTML=options.length?options.map(o=>`
      <article class="catalog-offer ${o.status==='ineligible'?'excluded':''}">
        <div class="offer-summary"><div><span class="eyebrow">${o.model==='PaaS'?'پلتفرم + دیتابیس + فضای فایل':'سرور / مدیریت با تیم شما'}</span><h3>${esc(o.provider)}</h3><p>${esc(o.plan)}</p></div>
          <div class="offer-specs"><span><bdi>${n(o.cpu)}</bdi> هسته</span><span><bdi>${n(o.ram)}</bdi> GB رم${o.model==='PaaS'?' برنامه':''}</span><span><bdi>${n(o.disk)}</bdi> GB دیسک${o.model==='PaaS'?' برنامه':''}</span><span>${o.trafficGB?`${n(o.trafficGB)} GB ترافیک درج‌شده`:'هزینهٔ ترافیک جداگانه'}</span></div>
          <div class="offer-price"><small>${o.priceKind==='starting_at'?'جمع پایه از':'جمع پایهٔ ماهانه'}</small><strong>${money(o.monthly)}</strong><span class="badge ${o.stale?'warning':''}">${o.stale?'تعرفه نیازمند بازبینی':o.status==='ineligible'?'خارج از گزینه‌های فعلی':'نامزد بررسی؛ تأیید نهایی نشده'}</span></div></div>
        ${o.reasons.length?`<p class="cost-warning">${esc(o.reasons.join(' · '))}</p>`:''}
        <details><summary>ریز هزینه، معماری و مسئولیت‌ها</summary><p>${esc(o.topology)}</p><dl class="cost-breakdown">${o.components.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${money(c.amount)}</dd></div>`).join('')}</dl>
          ${o.originalPrice.currency==='IRR'?`<p>تعرفهٔ اصلی سرور: ${n(o.originalPrice.amount)} ریال در ماه؛ هر ۱۰ ریال = ۱ تومان.</p>`:''}
          ${o.egressPerGB?`<p>تعرفهٔ دانلود: ${money(o.egressPerGB)} به ازای GB؛ در جمع بالا اعمال نشده است.</p>`:''}
          <p>${esc(o.responsibility)}</p><ul>${[...o.notes,...o.unknowns].map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details>
        <div class="offer-actions"><a href="${esc(o.source)}" target="_blank" rel="noreferrer">تعرفهٔ رسمی ↗</a><button class="secondary select-offer" data-id="${esc(o.id)}" ${o.status==='ineligible'?'disabled':''}>انتخاب و بررسی چک‌لیست ←</button></div>
      </article>`).join(''):'<div class="panel">گزینه‌ای با این فیلتر پیدا نشد؛ جست‌وجو یا فیلتر را تغییر دهید.</div>';
    root.querySelectorAll('.select-offer').forEach(b=>b.onclick=()=>onSelect(b.dataset.id));
  };
  root.querySelectorAll('.catalog-toolbar input,.catalog-toolbar select').forEach(e=>e.addEventListener('input',update));
  update();
}
