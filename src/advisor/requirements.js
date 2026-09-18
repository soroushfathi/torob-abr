import {z} from 'zod';
import {compare} from '../pricing/decimal.js';
const choice = values => z.enum([...values,'unknown']).default('unknown');
const quantity = z.string().max(100).default('unknown');
export const requirementsSchema=z.object({
 description:z.string().max(4000).default(''), stack:z.string().max(80).default('unknown'),
 database:choice(['PostgreSQL','MySQL','MongoDB','Redis','none']),region:choice(['Iran','any']),
 operations:choice(['small-team','experienced']),devops:choice(['yes','no']),
 operationsCapability:z.enum(['yes','no','unknown']).optional(),
 serverMaintenance:choice(['yes','no']),databaseMaintenance:choice(['yes','no']),
 budget:z.string().max(60).default('unknown'),stage:choice(['prototype','launch','growth','established']),
 budgetRange:z.enum(['under-2m','2m-5m','5m-10m','10m-plus','unknown']).optional(),
 scale:choice(['small','medium','large']),availability:choice(['standard','critical']),
 traffic:quantity,requestsPerSecond:quantity,concurrency:quantity,
 storage:quantity,media:choice(['none','images','files','video','mixed']),
 mediaGB:quantity,mediaGrowthGB:quantity,mediaImportance:choice(['replaceable','important','critical']),
 logs:choice(['none','basic','search']),logRetentionDays:quantity,logGB:quantity,
 paasLogsSufficient:choice(['yes','no']),gitPrivate:choice(['yes','no']),
 gitSelfHost:choice(['yes','no']),gitControl:choice(['standard','restricted','full']),
 ci:choice(['none','hosted','private-runner']),pricingPreference:choice(['auto','arvan-iaas','arvan-container']),
 cpuClass:choice(['basic','standard','premium','g2','g3','g4']),cpuCores:quantity,ramGB:quantity,diskGB:quantity,
 ephemeralGB:quantity,publicIPs:quantity,pricingRegion:z.string().max(60).default('unknown'),
 ingressGB:quantity,egressGB:quantity,usageDays:quantity,instances:quantity,
 supportLevel:z.string().max(80).default('none'),supportHours:quantity,supportPeople:quantity,supportBilling:choice(['once','recurring'])
});
export function hasOperationsCapability(r) {
 return r.operationsCapability!==undefined?r.operationsCapability==='yes':r.devops==='yes'&&r.serverMaintenance!=='no'&&r.databaseMaintenance!=='no';
}
const budgetBands={
 'under-2m':{label:'زیر ۲ میلیون تومان',min:0,max:2000000,maxExclusive:true},
 '2m-5m':{label:'۲ تا ۵ میلیون تومان',min:2000000,max:5000000,maxExclusive:false},
 '5m-10m':{label:'۵ تا ۱۰ میلیون تومان',min:5000000,max:10000000,maxExclusive:false},
 '10m-plus':{label:'۱۰ میلیون تومان به بالا',min:10000000,max:null,maxExclusive:false}
};
export function budgetBand(r) {
 if(r.budgetRange!==undefined)return {id:r.budgetRange,...(budgetBands[r.budgetRange]||{label:'نمی‌دانم',min:null,max:null,maxExclusive:false})};
 const amount=parseBudget(r.budget);
 return {id:amount===null?'unknown':'legacy-exact',label:null,min:amount,max:amount,maxExclusive:false};
}
export function assessBudget(knownMonthly,band) {
 if(knownMonthly===null||band.id==='unknown')return 'unknown';
 if(band.max===null)return 'unconfirmed';
 const relation=compare(knownMonthly,String(band.max));
 return relation>0||relation===0&&band.maxExclusive?'insufficient':'unconfirmed';
}
export function intakeFormDefaults(r) {
 const amount=parseBudget(r.budget);
 const range=r.budgetRange??(amount===null?'unknown':amount<2000000?'under-2m':amount<5000000?'2m-5m':amount<10000000?'5m-10m':'10m-plus');
 const legacyTeam=hasOperationsCapability(r)?'yes':[r.devops,r.serverMaintenance,r.databaseMaintenance].includes('no')?'no':'unknown';
 return {...r,budgetRange:range,operationsCapability:r.operationsCapability??legacyTeam,
  gitSelfHost:['restricted','full'].includes(r.gitControl)?'yes':r.gitSelfHost??'unknown'};
}
export function numberInput(value) {
 const text=String(value??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٬,]/g,'').replace(/٫/g,'.').trim();
 return /^\d+(?:\.\d+)?$/.test(text)&&Number.isFinite(Number(text))?Number(text):null;
}
export function parseBudget(text='') {
 const normalized=String(text).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٬,]/g,'').replace(/٫/g,'.').trim();
 const match=normalized.match(/^(\d+(?:\.\d+)?)\s*(میلیون|هزار)?\s*(تومان|ریال)?(?:\s*(?:در ماه|ماهانه))?$/);
 if(!match)return null;
 const value=Number(match[1])*(match[2]==='میلیون'?1e6:match[2]==='هزار'?1000:1)/(match[3]==='ریال'?10:1);
 return Number.isFinite(value)&&value>0&&value<=1e15&&!String(value).includes('e')?value:null;
}
