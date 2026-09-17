import {renderPackage} from './package-view.js';
import {renderPricingAdmin} from './pricing-admin.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let projectId=null, currentCatalog=null, currentRole=null, sessionAction=null, sessionBusy=false;
const sessionChanges=typeof BroadcastChannel==='function'?new BroadcastChannel('torob-session-changes'):null;
if(sessionChanges)sessionChanges.onmessage=()=>window.location.reload();
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,data){const r=await fetch('/api'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
function notice(message){$('#notice').textContent=message;}
async function view(name){$$('[data-page]').forEach(e=>e.classList.toggle('hidden',e.dataset.page!==name));$$('nav button').forEach(e=>e.classList.toggle('active',e.dataset.view===name));$('#breadcrumb').textContent=$(`nav button[data-view="${name}"]`).textContent.trim();window.scrollTo({top:0,behavior:'smooth'});if(name==='projects')await projects();if(name==='analytics')await analytics();if(name==='pricing')await renderPricingAdmin($('#pricing-admin'),api,notice);}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-view]');if(target)try{await view(target.dataset.view);}catch(err){notice(err.message);}});
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/session',{token:new FormData(e.target).get('token')});e.target.reset();sessionChanges?.postMessage('changed');notice('');await init();}catch(err){notice(err.message);}});
function showSessionAction(action){
 sessionAction=action;
 const admin=action==='admin',logout=action==='logout';
 $('#session-action-form').reset();$('#session-error').textContent='';
 $('#session-dialog-title').textContent=logout?'خروج از حساب':admin?'ورود به حالت مدیر':'رفتن به حالت کاربر';
 $('#session-dialog-description').textContent=logout?'نشست فعلی بسته می‌شود. در مدل ورود فعلی، ورود دوباره فضای کاری تازه‌ای می‌سازد و پروژه‌های این نشست در آن نمایش داده نمی‌شوند.':`پروژه‌های ذخیره‌شده حفظ می‌شوند؛ صفحه بازخوانی می‌شود و تغییرات ذخیره‌نشدهٔ فرم باقی نمی‌مانند.${admin?' کلید مدیر (ADMIN_ACCESS_TOKEN) را از فایل خصوصی .env وارد کنید.':' دسترسی مدیریت این نشست غیرفعال می‌شود.'}`;
 $('#admin-token-label').classList.toggle('hidden',!admin);
 const input=$('#session-action-form').elements.adminToken;input.disabled=!admin;input.required=admin;
 $('#session-confirm').textContent=logout?'خروج از حساب':admin?'ورود به حالت مدیر':'تغییر به حالت کاربر';
 $('#session-dialog').showModal();if(admin)input.focus();else $('#session-cancel').focus();
}
$('#switch-role').onclick=()=>showSessionAction(currentRole==='admin'?'user':'admin');
$('#logout').onclick=()=>showSessionAction('logout');
$('#session-cancel').onclick=()=>$('#session-dialog').close();
$('#session-dialog').addEventListener('cancel',e=>{if(sessionBusy)e.preventDefault();});
$('#session-dialog').addEventListener('close',()=>{$('#session-action-form').reset();$('#session-error').textContent='';sessionAction=null;});
$('#session-action-form').addEventListener('submit',async e=>{
 e.preventDefault();if(sessionBusy)return;sessionBusy=true;
 $('#session-confirm').disabled=true;$('#session-cancel').disabled=true;$('#session-error').textContent='';
 const input=e.target.elements.adminToken,token=input.value;input.value='';
 try{
  if(sessionAction==='logout')await api('/session/logout',{});
  else await api('/session/role',{role:sessionAction,...(sessionAction==='admin'?{token}:{})});
  // Reload drops privileged DOM and pending page work after a session change.
  sessionChanges?.postMessage('changed');
  window.location.reload();
 }catch(err){$('#session-error').textContent=err.message;sessionBusy=false;$('#session-confirm').disabled=false;$('#session-cancel').disabled=false;if(sessionAction==='admin')input.focus();}
});
$('#example').onclick=()=>{projectId=null;$('#intake').reset();$('#recommendation').innerHTML='';view('advisor');};
$('#new-project').onclick=()=>{projectId=null;$('#intake').reset();$('#recommendation').innerHTML='';notice('نمونهٔ تازه؛ پروژه‌های قبلی در فهرست پروژه‌ها هستند.');};
$('#intake').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('button.primary');button.disabled=true;try{const {name,...input}=Object.fromEntries(new FormData(e.target));if(!projectId){const p=await api('/projects',{name});projectId=p.id;}const result=await api(`/projects/${projectId}/recommend`,input);currentCatalog=result.catalogSnapshot;await api(`/projects/${projectId}/events`,{name:'comparison_viewed'});renderRecommendation(result);notice('نیازها و گزارش بسته ذخیره شدند؛ انتخاب تا تأیید مجهولات موقت است.');}catch(err){notice(err.message);}finally{button.disabled=false;}});
function renderRecommendation(r,historical=false){
 renderPackage($('#recommendation'),r,{onSelect:select,currentVersion:currentCatalog?.version,onRefresh:()=>$('#intake').requestSubmit(),onHistory:reportHistory,historical});
 $('#recommendation').scrollIntoView({behavior:'smooth'});
}
async function select(id){try{const {option:o}=await api(`/projects/${projectId}/select`,{id});if(o.checklist){await selectedPackage(o,id);return;}await api(`/projects/${projectId}/events`,{name:'checklist_viewed'});$('#checklist').innerHTML=`<div class="panel"><span class="eyebrow">انتخاب زیرساخت / ۰۳</span><h2>چک‌لیست تهیهٔ منابع · ${esc(o.provider)}</h2><p class="callout">انتخاب موقت؛ پیش از خرید همهٔ موارد ناشناخته را تأیید کنید.</p><ul><li>${esc(o.plan)}</li><li>تأیید منطقهٔ ${esc(o.region)}، دسترسی خرید و روش پرداخت</li><li>${esc(o.topology)}</li><li>${esc(o.responsibility)}</li>${o.unknowns.map(t=>`<li>${esc(t)}</li>`).join('')}<li>بررسی SLA و آزمایش بازیابی قبل از استفادهٔ عملیاتی</li></ul><button id="provider-link" class="primary">مشاهده پلن در سایت ارائه‌دهنده ↗</button> <button id="create-plan" class="secondary">نمایش طرح sandbox</button><p class="muted">کلیک فقط یک ارجاع است؛ خرید ثبت نمی‌شود.</p><div id="plan"></div></div>`;$('#provider-link').onclick=async()=>{const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{await api(`/projects/${projectId}/events`,{name:'provider_clicked',provider:id});if(tab)tab.location=o.purchase;else notice('کلیک ثبت شد؛ مرورگر باز شدن صفحه را مسدود کرد.');}catch(err){tab?.close();notice(err.message);}};$('#create-plan').onclick=async()=>{const p=await api(`/projects/${projectId}/plan`,{});$('#plan').innerHTML=`<h3>طرح برای بازبینی؛ اجرا نشده</h3><pre>${esc(JSON.stringify(p,null,2))}</pre>`;};$('#checklist').scrollIntoView({behavior:'smooth'});}catch(err){notice(err.message);}}
async function projects(){const list=await api('/projects');$('#projects-list').innerHTML=list.length?list.map(p=>`<article><span class="eyebrow">${new Date(p.created_at).toLocaleDateString('fa-IR')}</span><h3>${esc(p.name)}</h3><p>${esc(p.recommendation?.model||'نیازهای اولیه')}</p><span class="badge">${p.selected?'گزینهٔ موقت انتخاب شده':'در حال بررسی'}</span><button class="secondary open-project" data-id="${p.id}">ادامهٔ بررسی ←</button></article>`).join(''):'<div class="panel">هنوز پروژه‌ای ندارید. از انتخاب زیرساخت شروع کنید.</div>';$$('.open-project').forEach(b=>b.onclick=async()=>{const p=list.find(x=>x.id===b.dataset.id);projectId=p.id;$('#intake').reset();$('#intake').elements.pricingPreference.value=p.requirements.pricingPreference||'auto';configureMeteredFields();for(const [key,value] of Object.entries({name:p.name,...(p.formDefaults||p.requirements)})){const field=$('#intake').elements.namedItem(key);if(field)field.value=value;}await view('advisor');$('#recommendation').innerHTML='';if(p.recommendation)renderRecommendation(p.recommendation);});}
const names={intake_started:'شروع نیازسنجی',intake_completed:'نیازسنجی کامل',recommendation_succeeded:'پیشنهاد واجد شرایط',no_eligible_option:'بدون گزینهٔ تأییدشده',comparison_viewed:'مشاهدهٔ مقایسه',plan_selected:'انتخاب گزینه',checklist_viewed:'مشاهدهٔ چک‌لیست',provider_clicked:'کلیک ارائه‌دهنده',feedback_useful:'بازخورد مفید',feedback_not_useful:'بازخورد نامفید'};
async function analytics(){const data=await api('/analytics');$('#analytics-list').innerHTML=data.events.length?data.events.map(e=>`<article><h3>${esc(names[e.name]||e.name)}</h3><span class="metric">${e.count.toLocaleString('fa-IR')}</span><p>${data.source==='verification'?'فعالیت واقعی آزمون؛ جدا از کاربر':'فعالیت همین نشست'}</p></article>`).join(''):'<div class="panel">هنوز رویدادی ثبت نشده است.</div>';}
$$('.investigate').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const report=await api('/incidents',{kind:b.dataset.kind});$('#incident').innerHTML=`<h3>${esc({healthy:'در شواهد فعلی سالم',unhealthy:'نیازمند بررسی',inconclusive:'شواهد ناکافی',integration_unavailable:'اتصال پایش در دسترس نیست'}[report.status])}</h3><p>${esc(report.symptoms)}</p><p>${esc(report.hypotheses.join(' · '))}</p><p class="callout">${esc(report.remediation)}</p><details open><summary>شواهد و پرس‌وجوهای واقعی</summary><pre>${esc(JSON.stringify(report,null,2))}</pre></details>`;}catch(err){notice(err.message);}finally{b.disabled=false;}});
async function init(){
 try{
  const me=await api('/me');currentRole=me.role;
  $('#session-role').textContent=me.role==='admin'?'حالت مدیر':'حالت کاربر';
  $('#switch-role').textContent=me.role==='admin'?'رفتن به حالت کاربر':'ورود به حالت مدیر';
  $('#session-controls').classList.remove('hidden');$('#pricing-nav').classList.toggle('hidden',me.role!=='admin');
  $('#login').classList.add('hidden');$('#workspace').classList.remove('hidden');
 }catch{
  currentRole=null;$('#session-controls').classList.add('hidden');$('#pricing-nav').classList.add('hidden');
  $('#login').classList.remove('hidden');$('#workspace').classList.add('hidden');
 }
 if(currentRole)try{currentCatalog=await api('/catalog');configureMeteredFields();}catch(err){notice(err.message);}
 try{const health=await api('/health');$('#health').textContent=health.database==='connected'?'● دیتابیس متصل':'اتصال ناموجود';}catch{$('#health').textContent='دیتابیس در دسترس نیست';}
}
init();

function configureMeteredFields(){
 const form=$('#intake'),service=form.elements.pricingPreference.value==='arvan-container'?'paas':'iaas';
 const tariff=currentCatalog?.tariffs?.find(p=>p.providerId==='arvan'&&p.service===service);
 const selected=form.elements.pricingRegion.value;
 $('#pricing-region').innerHTML='<option value="unknown">نمی‌دانم</option>'+((tariff?.product.regions)||[]).filter(r=>r.key.startsWith('ir-')).map(r=>`<option value="${esc(r.key)}">${esc(r.name)} (${esc(r.key)})</option>`).join('');
 if([...form.elements.pricingRegion.options].some(o=>o.value===selected))form.elements.pricingRegion.value=selected;
 const support=currentCatalog?.tariffs?.find(p=>p.providerId==='arvan'&&p.service==='devops');
 const level=form.elements.supportLevel.value;
 $('#support-level').innerHTML='<option value="none">هیچ سطحی انتخاب نشده</option><option value="unknown">نمی‌دانم؛ نیازمند استعلام</option>'+(support?.product.metrics||[]).map(m=>`<option value="${esc(m.key)}">${esc(m.title)}</option>`).join('');
 if([...form.elements.supportLevel.options].some(o=>o.value===level))form.elements.supportLevel.value=level;
 const metered=['arvan-iaas','arvan-container'].includes(form.elements.pricingPreference.value);
 $('#metered-inputs').classList.toggle('hidden',!metered);
 $('#metered-inputs').querySelectorAll('input,select,textarea').forEach(field=>field.disabled=!metered);
 $('#metered-inputs').open=metered;
 if(metered)$('#advanced-intake').open=true;
}
$('#intake').elements.pricingPreference.addEventListener('change',configureMeteredFields);
$('#intake').addEventListener('reset',()=>queueMicrotask(()=>{$('#advanced-intake').open=false;configureMeteredFields();}));
async function reportHistory(){try{const list=await api(`/projects/${projectId}/reports`);$('#report-history-list').innerHTML='<div class="history-list">'+list.map(r=>`<button class="secondary open-report" data-id="${esc(r.id)}">${new Date(r.created_at).toLocaleString('fa-IR')} · ${esc(r.rules_version)}</button>`).join('')+'</div>';$$('.open-report').forEach(b=>b.onclick=async()=>{try{renderRecommendation(await api(`/projects/${projectId}/reports/${b.dataset.id}`),true);}catch(err){notice(err.message);}});}catch(err){notice(err.message);}}

async function selectedPackage(o,id){
 await api(`/projects/${projectId}/events`,{name:'checklist_viewed'});
 const source=o.components.find(c=>c.id==='app')?.plan?.source;
 $('#checklist').innerHTML=`<div class="panel"><h2>${esc(o.title)} · انتخاب موقت ثبت شد</h2><ul>${o.checklist.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p>این انتخاب تأیید خرید، ظرفیت یا استقرار نیست.</p>${source?'<button class="primary" id="package-provider">مشاهدهٔ منبع ارائه‌دهنده ↗</button>':''} <button class="secondary" id="package-sandbox">نمایش طرح sandbox</button><div id="package-plan"></div></div>`;
 if(source)$('#package-provider').onclick=async()=>{const url=new URL(source);if(url.protocol!=='https:')return;const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;try{await api(`/projects/${projectId}/events`,{name:'provider_clicked',provider:id});if(tab)tab.location=url.href;}catch(err){tab?.close();notice(err.message);}};
 $('#package-sandbox').onclick=async()=>{try{const plan=await api(`/projects/${projectId}/plan`,{});$('#package-plan').innerHTML=`<h3>طرح برای بازبینی؛ اجرا نشده</h3><pre>${esc(JSON.stringify(plan,null,2))}</pre>`;}catch(err){notice(err.message);}};
 $('#checklist').scrollIntoView({behavior:'smooth'});
}
