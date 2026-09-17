import {createHash} from 'node:crypto';
import {compare,multiply,onStep,subtract,sum,toman} from './decimal.js';
const ENDPOINT='https://napi.arvancloud.ir/chortke/v1/calculate-resources';
const required=['cpuCores','ramGB','diskGB','publicIPs','ingressGB','egressGB','usageDays','instances'];
function decimal(v){const s=String(v??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٬,]/g,'').replace(/٫/g,'.').trim();return /^\d{1,9}(?:\.\d{1,3})?$/.test(s)?s:null;}
export function configurationFromRequirements(r) {
 const result={service:r.pricingPreference==='arvan-container'?'paas':'iaas',region:r.pricingRegion,cpuClass:r.cpuClass,support:[],assumptions:[],source:'explicit_intake'};
 for(const field of [...required,'ephemeralGB'])result[field]=decimal(r[field]);
 if(r.supportLevel!=='none')result.support=[{level:r.supportLevel,hours:decimal(r.supportHours),people:decimal(r.supportPeople),billing:r.supportBilling}];
 if(result.usageDays==='30')result.assumptions.push('بازهٔ ۳۰ روز صرفاً فرض صریح همین برآورد است؛ ماه تعرفهٔ سایر ارائه‌دهندگان نیست.');
 return result;
}
export function prepareQuote(tariff,configuration,supportTariff) {
 const c=structuredClone(configuration),errors=[],warnings=[];
 for(const k of required)if(c[k]===null||c[k]===undefined)errors.push(`مقدار ${k} باید صریح باشد.`);
 if(!tariff||tariff.pricingModel!=='metered')return {errors:['تعرفهٔ منتشرشدهٔ ماشین‌حساب در دسترس نیست.'],configuration:c};
 const p=tariff.product,region=p.regions?.find(x=>x.key===c.region);
 if(!region)errors.push('منطقه باید از منطقه‌های همین سرویس انتخاب شود.');
 if(region&&!region.key.startsWith('ir-'))errors.push('بستهٔ فعلی فقط میزبانی ایران را پوشش می‌دهد.');
 if(compare(c.usageDays??'0','1')<0||compare(c.usageDays??'0','366')>0)errors.push('بازهٔ برآورد باید بین ۱ و ۳۶۶ روز باشد.');
 if(c.instances===null||!onStep(c.instances??'0',String(p.orderByCountMin||1),String(p.orderByCountStep||1))||compare(c.instances??'0',String(p.orderByCountMin||1))<0||compare(c.instances??'0',String(p.orderByCountMax||100))>0)errors.push('تعداد نمونه با محدودیت ماشین‌حساب سازگار نیست.');
 if(compare(c.cpuCores??'0','0')<=0||compare(c.ramGB??'0','0')<=0)errors.push('CPU و RAM باید مثبت و متناسب با بار باشند.');
 const container=c.service==='paas';
 if(container?!['g2','g3','g4'].includes(c.cpuClass):!['basic','standard','premium'].includes(c.cpuClass))errors.push('کلاس CPU با نوع سرویس سازگار نیست.');
 const resources=[],unknowns=[],lines=[];
 const selected=container?[[`paas_cpu_${c.cpuClass}_shared`,c.cpuCores],[`paas_ram_${c.cpuClass}_shared`,c.ramGB],['paas_disk_ssd',c.diskGB],['paas_ephemeral_ssd',c.ephemeralGB],['paas_ip_v4_lb',c.publicIPs],['paas_rx_internet',c.ingressGB],['paas_tx_internet',c.egressGB]]:[[ `cc_cpu_${c.cpuClass}`,c.cpuCores],[`cc_memory_${c.cpuClass}`,c.ramGB],['cc_disk_hot',c.diskGB],['cc_public_ip',c.publicIPs],['cc_internet',c.ingressGB],['cc_internet_send',c.egressGB]];
 for(const [key,value] of selected){
  const metric=p.metrics.find(m=>m.key===key);
  if(!metric||value===null||value===undefined){errors.push(`منبع یا مقدار ${key} تأیید نشده است.`);continue;}
  const bounds=metric.values?.find(v=>v.regionId===region?.id)||metric.values?.find(v=>v.regionId==='');
  if(bounds){if(compare(value,String(bounds.min))<0||compare(value,String(bounds.max))>0||!onStep(value,String(bounds.min),String(bounds.step)))errors.push(`مقدار ${metric.title} خارج از حدود یا گام اعلام‌شده است.`);}
  else if(compare(value,'0')>0)unknowns.push(`حداقل/گام سفارش ${metric.title} در تنظیمات عمومی اعلام نشده است.`);
  lines.push({key,provider:'arvan',service:c.service,region:c.region,resourceClass:c.cpuClass,resourceName:metric.title,unit:metric.unit,quantity:value,rate:null,originalCurrency:'IRR',timeBasis:metric.calculationType,durationSeconds:multiply(c.usageDays??'0','86400'),instances:c.instances,freeQuota:null,usageTiers:null,minimumOrder:bounds?.min??null,calculatorBounds:bounds?{min:bounds.min,max:bounds.max,step:bounds.step}:null,taxStatus:'unknown',sideCostsStatus:'unknown',source:tariff.source,tariffVersion:tariff.versionId,verificationStatus:'configuration_quote_only'});
  if(compare(value,'0')>0||metric.alwaysCalculable)resources.push({productId:p.id,metricKey:key,amount:Number(value),duration:Number(multiply(c.usageDays??'0','86400')),region:c.region,instanceCount:1});
 }
 // Alternative support levels never enter the infrastructure resources or each other's totals.
 const support=c.support.map(s=>({...s,status:'requires_quote',amount:null,reason:'دامنهٔ قرارداد، دوره و نرخ نفر/ساعت باید تأیید شود؛ خرید پشتیبانی معادل مدیریت کامل زیرساخت نیست.',knownService:supportTariff?.product?.metrics.some(m=>m.key===s.level)||false}));
 if(support.length)unknowns.push('خدمات DevOps/پشتیبانی منتخب نیازمند استعلام‌اند و به هزینهٔ زیرساخت اضافه نشده‌اند.');
 warnings.push('هم‌خانواده بودن CPU/RAM و حدود ماشین‌حساب کنترل شده‌اند؛ نسبت‌های مجاز منابع، موجودی منطقه و قابلیت سفارش از API عمومی تأیید نشده‌اند.');
 if(container)warnings.push('دیسک موقت برای دادهٔ پایدار نیست؛ volume مستقل لحاظ شده است. دامنهٔ مدیریت سرویس کانتینر برای تیم بدون DevOps هنوز تأیید نشده است.');
 return {configuration:c,errors,warnings,unknowns,resources,lines,support,compatibilityStatus:'requires_provider_confirmation'};
}
let lastRequest=0;
let busy=false;
export async function estimateArvan(tariff,configuration,supportTariff) {
 const prepared=prepareQuote(tariff,configuration,supportTariff);
 if(prepared.errors.length)return {...prepared,status:'invalid_configuration',calculatedTotal:null,sourceTotal:null,difference:null};
 if(busy||Date.now()-lastRequest<5000)return {...prepared,status:'rate_limited',calculatedTotal:null,sourceTotal:null,difference:null};
 busy=true;lastRequest=Date.now();
 let sourceHttpStatus=null;
 try {
  const response=await fetch(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),headers:{'Content-Type':'application/json','User-Agent':'TorobCloud-Pricing/1.0'},body:JSON.stringify({currency:'irr',resources:prepared.resources})});
  sourceHttpStatus=response.status;
  if(!response.ok)throw new Error(`source_http_${response.status}`);
  const reader=response.body.getReader();const chunks=[];let bytes=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576)throw new Error('response_too_large');chunks.push(value);}}finally{await reader.cancel();}
  const raw=Buffer.concat(chunks),data=JSON.parse(raw.toString('utf8')).data;
  if(!Array.isArray(data?.resources)||typeof data.totalPrice!=='string')throw new Error('source_schema_changed');
  const rows=new Map();for(const row of data.resources){if(rows.has(row.metricKey)||typeof row.totalPrice!=='string'||compare(row.totalPrice,'0')<0)throw new Error('source_rows_invalid');rows.set(row.metricKey,row);}
  if(rows.size!==prepared.resources.length)throw new Error('source_partial_response');
  for(const expected of prepared.resources){const actual=rows.get(expected.metricKey);if(!actual||actual.region!==expected.region||actual.productId!==expected.productId||compare(String(actual.amount),String(expected.amount))!==0||actual.duration!==expected.duration)throw new Error('source_configuration_mismatch');}
  const lines=prepared.lines.map(line=>{const row=rows.get(line.key);return {...line,sourceRow:row??null,sourceRowTotal:row?.totalPrice??null,total:row?multiply(row.totalPrice,configuration.instances):null,usageTiers:row?.unitPrices??null,rate:null,rateNote:'amount هر پله جمع همان پله است، نه نرخ واحد؛ به مقادیر دیگر تعمیم داده نمی‌شود.'};});
  const calculatedPerInstance=sum(data.resources.map(row=>row.totalPrice));
  const calculatedTotal=multiply(calculatedPerInstance,configuration.instances),sourceTotal=data.totalPrice,sourceTotalForInstances=multiply(sourceTotal,configuration.instances),difference=subtract(calculatedTotal,sourceTotalForInstances);
  return {...prepared,lines,status:difference==='0'?'quoted_requires_verification':'review',calculatedTotal,sourceTotal,sourceTotalForInstances,sourceTotalScope:'one explicitly requested instance; count multiplication follows calculator JS, not a tariff rate assumption',difference,currency:'IRR',displayToman:toman(calculatedTotal),taxStatus:'unknown',estimateComplete:false,
   source:ENDPOINT,retrievedAt:new Date().toISOString(),evidence:{sha256:createHash('sha256').update(raw).digest('hex'),bytes,request:{currency:'irr',resources:prepared.resources},response:data},tariffVersion:tariff.versionId};
 }catch(error){return {...prepared,status:'source_unavailable',sourceHttpStatus,errorCode:/^(source_[a-z0-9_]+|response_too_large)$/.test(error.message)?error.message:'source_unreachable',calculatedTotal:null,sourceTotal:null,difference:null,error:[401,403].includes(sourceHttpStatus)?'دسترسی منبع محدود شده است؛ چالش دور زده نشد و تاریخ تعرفه تغییر نکرد.':'دریافت یا تطبیق پاسخ ماشین‌حساب ناموفق بود؛ تاریخ تعرفه تغییر نکرد.'};}
 finally{busy=false;}
}
