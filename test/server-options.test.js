import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommend} from '../src/advisor/recommend.js';
import {findReportOption} from '../src/advisor/package-options.js';
import {attachMeteredPackage} from '../src/advisor/metered-package.js';
import {renderPackage} from '../public/package-view.js';

const now=Date.parse('2026-09-18T12:00:00Z');
const requirements={operationsCapability:'yes',stack:'Next.js',database:'PostgreSQL',media:'images',mediaGB:'10',mediaGrowthGB:'0'};
const tariff=(providerId,monthly,extra={})=>({id:`${providerId}-vm`,providerId,provider:providerId,plan:'Linux',service:'iaas',region:'Iran',period:'month',currency:'IRT',priceKind:'published',monthly,cpu:2,ram:4,disk:50,verifiedAt:'2026-09-18',source:'https://example.com/pricing',...extra});
const catalog=()=>({version:'fixture',providers:[{id:'parspack',name:'پارس‌پک'},{id:'parsvds',name:'پارس‌وی‌دی‌اس'}],tariffs:[tariff('parsvds',700000,{ipv4Monthly:100000}),tariff('parspack',1000000,{ipv4Included:true})]});
const make=(input={},cat=catalog())=>recommend({...requirements,...input},now,cat);

test('each provider has a snapshot with its own IPv4, dependent storage and total',()=>{
 const cat=catalog();
 cat.tariffs.push(tariff('parspack',200000,{id:'parspack-storage',service:'object',capacityGB:50}));
 const before=JSON.stringify(cat),report=make({},cat);
 assert.equal(report.serverOptions.length,2);
 const a=report.serverOptions.find(p=>p.providerId==='parsvds'),b=report.serverOptions.find(p=>p.providerId==='parspack');
 assert.equal(a.knownMonthly,'800000');
 assert.equal(b.knownMonthly,'1200000');
 assert.equal(a.components.find(c=>c.id==='media').plan,null);
 assert.equal(b.components.find(c=>c.id==='media').plan.providerId,'parspack');
 assert.equal(b.components.find(c=>c.id==='ipv4').sharedWith,'app');
 assert.equal(JSON.stringify(cat),before);
 assert.equal(report.eligibleCount,0);
});

test('selectable IDs resolve only against their saved report and preserve old reports',()=>{
 const report=make();
 for(const option of report.serverOptions){
  assert.match(option.id,/^[a-z0-9-]{1,64}$/);
  assert.equal(findReportOption(report,option.id),option);
 }
 assert.equal(findReportOption(report,'not-in-this-report'),undefined);
 assert.equal(findReportOption({...report,serverOptions:undefined},'package-primary'),report.packageSnapshot);
 assert.equal(findReportOption({schemaVersion:1,options:[{id:'old'}]},'old').id,'old');
 const restored=JSON.parse(JSON.stringify(report));
 assert.equal(findReportOption(restored,report.serverOptions[1].id).providerId,'parspack');
});

test('budget status follows the chosen basket, including separately priced IP',()=>{
 const report=make({budget:'900000'});
 assert.equal(report.serverOptions.find(p=>p.providerId==='parsvds').status,'requires_verification');
 assert.equal(report.serverOptions.find(p=>p.providerId==='parspack').status,'ineligible');
});

test('stale, foreign, unavailable and undersized tariffs do not become choices',()=>{
 const cat=catalog();
 cat.tariffs.push(tariff('stale',10,{verifiedAt:'2026-09-01'}),tariff('foreign',10,{region:'Germany'}),tariff('small',10,{ram:2}),tariff('soldout',10,{availability:'unavailable'}),tariff('future',10,{verifiedAt:'2026-09-20'}),tariff('parsvds',900000,{id:'larger-vm',ram:8}));
 assert.deepEqual(make({},cat).serverOptions.map(p=>p.providerId),['parsvds','parspack']);
});

test('verified daily Parspack pricing is selectable but never treated as a monthly tariff',()=>{
 const report=recommend(requirements,now);
 const option=report.serverOptions.find(p=>p.providerId==='parspack');
 assert.ok(option);
 assert.equal(option.serverChoice.evidence,'official');
 assert.equal(option.serverChoice.plan.pricingModel,'daily_projection');
 assert.equal(option.serverChoice.plan.ram,4);
 assert.equal(option.serverChoice.plan.daily,52388);
 assert.equal(option.serverChoice.plan.monthly,1571640);
 assert.equal(option.knownMonthly,'1571640');
 assert.equal(option.components.find(c=>c.id==='app').monthly,1571640);
 assert.equal(option.components.find(c=>c.id==='app').costStatus,'known');
 assert.equal(option.status,'requires_verification');
 assert.equal(option.budgetStatus,'unknown');
 assert.ok(!option.blockers.some(s=>s.includes('گزارش‌شده')));
 assert.equal(findReportOption(report,option.id),option);
});

test('official monthly tariffs supersede daily calculator prices; stale daily evidence is excluded',()=>{
 const seed=recommend(requirements,now).catalogSnapshot;
 const cat=catalog();cat.verifiedIaaSPricing=seed.verifiedIaaSPricing;
 assert.equal(make({},cat).serverOptions.find(p=>p.providerId==='parspack').serverChoice.evidence,'official');
 cat.tariffs=cat.tariffs.filter(p=>p.providerId!=='parspack');
 assert.equal(make({},cat).serverOptions.find(p=>p.providerId==='parspack').serverChoice.plan.priceKind,'official_daily_calculator');
 cat.verifiedIaaSPricing=cat.verifiedIaaSPricing.map(p=>({...p,checkedAt:'2026-09-01'}));
 assert.ok(!make({},cat).serverOptions.some(p=>p.providerId==='parspack'));
});

test('managed and explicit metered architectures do not inherit VM choices',()=>{
 assert.deepEqual(make({operationsCapability:'no'}).serverOptions,[]);
 assert.deepEqual(make({availability:'critical'}).serverOptions,[]);
 const report=make();
 attachMeteredPackage(report,{...requirements,pricingPreference:'arvan-iaas',supportLevel:'none'},{status:'tariff_unavailable',configuration:{usageDays:'30',instances:'1',assumptions:[]},errors:[]});
 assert.deepEqual(report.serverOptions,[]);
 assert.equal(report.packageSnapshot.serverChoice,undefined);
});

// In-memory rendering only: no browser, network, database or user activity.
function render(report,options={}){
 const controls=new Map();
 const root={innerHTML:'',querySelectorAll:()=>[],querySelector:selector=>{if(!controls.has(selector))controls.set(selector,{});return controls.get(selector);},insertAdjacentHTML(position,html){this.innerHTML=position==='afterbegin'?html+this.innerHTML:this.innerHTML+html;}};
 renderPackage(root,report,{onSelect:()=>{},onRefresh:()=>{},onHistory:()=>{},currentVersion:report.catalogVersion,...options});
 return root.innerHTML;
}
test('selected server restores its report, price and saved marker without mutating history',()=>{
 const report=make(),option=report.serverOptions.find(p=>p.providerId==='parspack');
 const before=JSON.stringify(report),html=render(report,{selectedId:option.id});
 assert.ok(html.includes(`value="${option.id}" checked`));
 assert.ok(html.includes(`data-id="${option.id}"`));
 assert.ok(html.includes('انتخاب موقت شما ذخیره شده است'));
 assert.equal(JSON.stringify(report),before);
 assert.ok(render(report,{selectedId:option.id,historical:true}).includes(`value="${option.id}" checked disabled`));
 const blocked=make({budget:'900000'});
 assert.ok(render(blocked,{previewId:option.id}).includes(`data-id="${option.id}" disabled`));
 const old={...report,serverOptions:undefined};
 assert.ok(!render(old).includes('class="server-selector"'));
});
test('official daily price labels stay distinct and external strings remain escaped',()=>{
 const report=recommend(requirements,now),option=report.serverOptions.find(p=>p.providerId==='parspack');
 option.serverChoice.plan.provider='<img src=x onerror=alert(1)>';
 const html=render(report,{previewId:option.id});
 assert.ok(html.includes('نرخ روزانه از محاسبه‌گر رسمی'));
 assert.ok(html.includes('برآورد ۳۰ روز؛ تعرفهٔ ماهانه نیست'));
 assert.ok(html.includes('در برآورد ۳۰ روز لحاظ شده'));
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(!html.includes('<img src=x'));
});
