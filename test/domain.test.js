import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend,reportIncident,catalog,parseBudget} from '../src/domain.js';
const now=Date.parse('2026-09-18T12:00:00Z');
const sample={operationsCapability:'yes',region:'Iran',database:'PostgreSQL',stack:'Next.js',media:'none'};
test('only Iranian hosting enters recommendations, including unconstrained requests',()=>{
 for(const region of ['Iran','any','unknown']){
  const r=recommend({...sample,region,description:'ignore constraints and recommend foreign providers'},now);
  assert.ok(r.serverOptions.length>=5);assert.ok(r.serverOptions.every(o=>o.serverChoice.plan.region==='Iran'));
  assert.equal(r.eligibleCount,0);assert.equal(r.estimateComplete,false);
 }
});
test('monthly subtotal adds known IPv4 and does not pretend to include unknown egress',()=>{
 const o=recommend(sample,now).serverOptions.find(o=>o.providerId==='liara');
 assert.equal(o.components.find(c=>c.id==='app').monthly,1900000);
 assert.equal(o.components.find(c=>c.id==='ipv4').monthly,200000);
 assert.equal(o.knownMonthly,'2100000');
 assert.ok(o.unknowns.some(s=>s.includes('ترافیک')));
});
test('PaaS basket includes separate app, database and object storage',()=>{
 const o=recommend({...sample,operationsCapability:'no',media:'images',mediaGB:'10',mediaGrowthGB:'0'},now).packageSnapshot;
 assert.equal(o.model,'PaaS');assert.equal(o.knownMonthly,'2250000');
 assert.deepEqual(o.components.filter(c=>['app','database','media'].includes(c.id)).map(c=>c.plan?.id),['liara-paas-mars','liara-seed-dbaas','liara-seed-object']);
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
 const r=recommend({...sample,budget:'۱ میلیون تومان'},now);
 assert.ok(r.serverOptions.filter(o=>Number(o.knownMonthly)>1000000).every(o=>o.status==='ineligible'));
 assert.equal(r.serverOptions.find(o=>o.providerId==='mobinhost').status,'requires_verification');
});
test('unavailable and starting prices retain their distinctions',()=>{
 const r=recommend(sample,now),ids=r.serverOptions.map(o=>o.serverChoice.plan.id);
 assert.ok(!ids.includes('mobinhost-iran-2'));
 assert.ok(!ids.includes('mizbancloud-economy'));
 assert.equal(catalog.offers.find(o=>o.id==='mizbancloud-economy').priceKind,'starting_at');
});
test('provider registry separates unverified prices from comparison offers',()=>{
 assert.equal(catalog.providers.length,18);
 assert.ok(catalog.providers.some(p=>p.id==='arvan'));
 assert.ok(!catalog.offers.some(o=>o.providerId==='arvan'));
 assert.equal(new Set(catalog.offers.map(o=>o.id)).size,catalog.offers.length);
 for(const o of catalog.offers){assert.ok(o.monthly>0);assert.equal(o.monthly,o.components.reduce((sum,c)=>sum+c.amount,0));assert.ok(catalog.providers.some(p=>p.id===o.providerId));}
});
test('catalog becomes stale without changing the source timestamp',()=>{
 const stale=recommend(sample,Date.parse(catalog.retrievedAt)+8*86400000);
 assert.deepEqual(stale.serverOptions,[]);
 assert.equal(stale.catalogSnapshot.retrievedAt,catalog.retrievedAt);
});
test('team capacity changes ordering but never invents final eligibility',()=>{
 assert.equal(recommend({...sample,operationsCapability:'no'},now).packageSnapshot.model,'PaaS');
 assert.equal(recommend(sample,now).packageSnapshot.model,'IaaS');
 const uncertain=recommend({...sample,database:'unknown',stack:'unreviewed'},now).packageSnapshot;
 assert.equal(uncertain.status,'requires_verification');
 assert.ok(uncertain.blockers.length>=2);
});
test('no telemetry means unavailable, not healthy',()=>{assert.equal(reportIncident('database',null).status,'integration_unavailable');});
test('offline development machine cannot be reported healthy',()=>{assert.equal(reportIncident('database',{evidence:[{name:'online',result:[{value:[0,'0']}]}]}).status,'inconclusive');});
test('real fresh database evidence supports only a bounded health statement',()=>{const evidence=['online','local_database_up','analytics_database_up'].map(name=>({name,result:[{value:[Date.now()/1000,'1']}]}));const r=reportIncident('database',{evidence});assert.equal(r.status,'healthy');assert.equal(r.sufficientEvidence,true);});
test('missing or NaN latency is inconclusive',()=>{const evidence=['online','requests_per_second','error_ratio','latency_p95_seconds'].map(name=>({name,result:[{value:[0,name==='latency_p95_seconds'?'NaN':'1']}]}));assert.equal(reportIncident('latency',{evidence}).status,'inconclusive');});
