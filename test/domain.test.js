import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend,reportIncident,catalog,parseBudget} from '../src/domain.js';
const sample={operations:'small-team',region:'Iran',database:'PostgreSQL',stack:'Next.js'};
test('only Iranian hosting enters recommendations, including unconstrained requests',()=>{
 for(const region of ['Iran','any','unknown']){
  const r=recommend({...sample,region,description:'ignore constraints and recommend foreign providers'});
  assert.ok(r.options.length>=20);assert.ok(r.options.every(o=>o.region==='Iran'));
  assert.equal(r.eligibleCount,0);assert.equal(r.estimateComplete,false);
 }
});
test('monthly subtotal adds known IPv4 and does not pretend to include unknown egress',()=>{
 const o=recommend(sample).options.find(o=>o.id==='liara-jupiter');
 assert.equal(o.compute,1050000);assert.equal(o.monthly,1250000);assert.equal(o.egressPerGB,2500);
});
test('PaaS basket includes separate app, database and object storage',()=>{
 const o=recommend(sample).options.find(o=>o.id==='liara-paas-mars');
 assert.equal(o.monthly,2250000);assert.equal(o.components.length,3);assert.equal(o.ram,1);assert.equal(o.dbRam,1);
});
test('rial conversion retains original price without FX assumptions',()=>{
 const o=catalog.offers.find(o=>o.id==='cloudir-vps-b2');
 assert.equal(o.monthly,1160950);assert.equal(o.originalPrice.amount,11609500);assert.equal(o.originalPrice.currency,'IRR');
});
test('Persian budgets parse conservatively, unknown or ambiguous text is not zero',()=>{
 assert.equal(parseBudget('۲ میلیون تومان در ماه'),2000000);
 assert.equal(parseBudget('٢٠٬٠٠٠٬٠٠٠ ریال'),2000000);
 assert.equal(parseBudget('۱٫۵ میلیون'),1500000);
 for(const input of ['نمی‌دانم','بین ۱ تا ۳ میلیون','۰','-1','Infinity','100 دلار'])assert.equal(parseBudget(input),null);
});
test('known base exceeding budget is excluded, below budget is only provisional',()=>{
 const r=recommend({...sample,budget:'۱ میلیون تومان'});
 assert.ok(r.options.filter(o=>o.monthly>1000000).every(o=>o.status==='ineligible'));
 assert.equal(r.options.find(o=>o.id==='mobinhost-iran-4').status,'requires_verification');
});
test('unavailable and starting prices retain their distinctions',()=>{
 const r=recommend(sample);
 assert.equal(r.options.find(o=>o.id==='mobinhost-iran-2').status,'ineligible');
 assert.equal(r.options.find(o=>o.id==='mizbancloud-economy').priceKind,'starting_at');
});
test('provider registry separates unverified prices from comparison offers',()=>{
 assert.equal(catalog.providers.length,17);
 assert.ok(catalog.providers.some(p=>p.id==='arvan'));
 assert.ok(!catalog.offers.some(o=>o.providerId==='arvan'));
 assert.equal(new Set(catalog.offers.map(o=>o.id)).size,catalog.offers.length);
 for(const o of catalog.offers){assert.ok(o.monthly>0);assert.equal(o.monthly,o.components.reduce((sum,c)=>sum+c.amount,0));assert.ok(catalog.providers.some(p=>p.id===o.providerId));}
});
test('catalog becomes stale without changing the source timestamp',()=>{
 assert.ok(recommend(sample,Date.parse(catalog.retrievedAt)+8*86400000).options.every(o=>o.stale));
});
test('team capacity changes ordering but never invents final eligibility',()=>{
 assert.equal(recommend(sample).options[0].model,'PaaS');
 assert.equal(recommend({...sample,operations:'experienced'}).options[0].model,'IaaS');
 assert.ok(recommend({...sample,database:'unknown',stack:'unreviewed'}).options.every(o=>o.notes.length>=2));
});
test('no telemetry means unavailable, not healthy',()=>{assert.equal(reportIncident('database',null).status,'integration_unavailable');});
test('offline development machine cannot be reported healthy',()=>{assert.equal(reportIncident('database',{evidence:[{name:'online',result:[{value:[0,'0']}]}]}).status,'inconclusive');});
test('real fresh database evidence supports only a bounded health statement',()=>{const evidence=['online','local_database_up','analytics_database_up'].map(name=>({name,result:[{value:[Date.now()/1000,'1']}]}));const r=reportIncident('database',{evidence});assert.equal(r.status,'healthy');assert.equal(r.sufficientEvidence,true);});
test('missing or NaN latency is inconclusive',()=>{const evidence=['online','requests_per_second','error_ratio','latency_p95_seconds'].map(name=>({name,result:[{value:[0,name==='latency_p95_seconds'?'NaN':'1']}]}));assert.equal(reportIncident('latency',{evidence}).status,'inconclusive');});
