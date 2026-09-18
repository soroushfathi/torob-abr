import {catalog} from '../catalog.js';
import {parspackOfficialTariffs} from './parspack-official.js';
// Historical manual evidence retains its real date, precision and caveats.
export function seedTariffs() {
 const plans=[];
 for(const o of catalog.offers.filter(o=>o.model==='IaaS')) plans.push({
  id:o.id,providerId:o.providerId,provider:o.provider,service:'iaas',region:o.region,tier:'standard',period:'month',plan:o.plan,
  monthly:o.compute,hourly:null,currency:'IRT',originalPrice:o.originalPrice,ram:o.ram,cpu:o.cpu,disk:o.disk,
  ipv4Monthly:o.components.find(c=>c.label==='IPv4')?.amount??null,ipv4Included:o.providerId!=='liara'?null:false,
  egressPerGB:o.egressPerGB??null,trafficGB:o.trafficGB??null,diskType:o.diskType??null,
  trafficAddon:o.trafficAddon??null,promotion:o.promotion??null,availability:o.availability??'unknown',
  priceKind:o.priceKind,source:o.source,verifiedAt:o.retrievedAt,retrievalPrecision:'day'});
 const paas=catalog.offers.filter(o=>o.model==='PaaS');
 for(const o of paas) plans.push({id:o.id,providerId:'liara',provider:'لیارا',service:'paas',region:'Iran',tier:'base',period:'month',plan:o.components[0].label,monthly:o.compute,hourly:null,currency:'IRT',ram:o.ram,cpu:o.cpu,disk:o.disk,priceKind:'published',source:o.source,verifiedAt:o.retrievedAt,availability:'unknown'});
 if(paas.length)for(const [service,plan,monthly,extra] of [['dbaas','دیتابیس مریخ',950000,{ram:1,cpu:1,disk:10}],['object','فضای فایل ۲۰GB',350000,{capacityGB:20}]])plans.push({id:`liara-seed-${service}`,providerId:'liara',provider:'لیارا',service,region:'Iran',tier:'base',period:'month',plan,monthly,hourly:null,currency:'IRT',priceKind:'published',source:paas[0].source,verifiedAt:paas[0].retrievedAt,availability:'unknown',...extra});
 return [...plans.map(p=>({...p,pricingModel:'fixed_plan',verificationStatus:'manual_evidence',unitRate:null,taxStatus:'unknown',freeQuota:null,usageTiers:null,minimumOrder:null})),...parspackOfficialTariffs.map(p=>structuredClone(p))];
}
export async function loadCatalog(pool) {
 const versions=(await pool.query(`SELECT DISTINCT ON (provider_id) id,provider_id,plans,verified_at FROM pricing.versions WHERE status='published' ORDER BY provider_id,published_at DESC,id DESC`)).rows;
 const replaced=new Set(versions.map(v=>v.provider_id));
 const sources=(await pool.query('SELECT id,support_status,adapter FROM pricing.sources')).rows;
 const submittedTariffs=(await pool.query("SELECT DISTINCT ON (provider_id,service) id,provider_id,service,source_url,received_at,plans FROM pricing.public_unverified_tariffs ORDER BY provider_id,service,received_at DESC,id DESC")).rows;
 return {...catalog,version:[catalog.version,...versions.map(v=>`${v.provider_id}:${v.id}`),...submittedTariffs.map(s=>`unverified:${s.id}`)].join('|'),
  providers:catalog.providers.map(p=>{const s=sources.find(s=>s.id===p.id);return s?.adapter!=='unsupported'&&s?{...p,note:s.support_status}:p;}),
  tariffs:[...seedTariffs().filter(p=>!replaced.has(p.providerId)),...versions.flatMap(v=>v.plans)],
  submittedTariffs,
  publishedVersions:versions.map(v=>({providerId:v.provider_id,id:v.id,verifiedAt:v.verified_at})),
  pricePolicy:'valid-publication-or-manual-evidence; maximum age 7 days'};
}
