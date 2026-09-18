import pg from 'pg';

const source='https://www.arvancloud.ir/fa/pricing/cloud-storage';
const shared={provider:'arvan',service:'object_storage',region:null,resourceClass:'standard',originalCurrency:'IRT',taxStatus:'unknown',additionalCostsStatus:'request_and_transfer_overage_not_fully_priced',sourceUrl:source,sourceRetrievedAt:null,evidenceType:'user_reported',verificationStatus:'unverified',verifiedAt:null};
const plans=[
 ['basic','پایه','5','GB','20','GB','0'],
 ['growth','رشد','500','GB','2','TB','1500000'],
 ['professional','حرفه‌ای','5','TB','20','TB','15000000'],
 ['enterprise','سازمانی',null,null,null,null,null],
].map(([key,name,storage,storageUnit,traffic,trafficUnit,monthly])=>({
 ...shared,pricingModel:'fixed_plan',key,name,resourceName:'بستهٔ فضای ابری',unit:'package',quantity:'1',rate:monthly,
 timeBasis:'month',duration:'1 month',instances:'1',storageAllowance:storage===null?'unlimited':{quantity:storage,unit:storageUnit},
 downloadTrafficAllowance:traffic===null?'unlimited':{quantity:traffic,unit:trafficUnit},
 freeQuota:key==='basic'?{storage:{quantity:'5',unit:'GB'},downloadTraffic:{quantity:'20',unit:'GB'}}:null,
 minimumOrder:null,usageTiers:null,priceStatus:monthly===null?'requires_quote':'user_reported_unverified',
}));
const storageTiers=[
 ['0','GB','5','GB','0'],['5','GB','5','TB','3000'],['5','TB','50','TB','2600'],
 ['50','TB','500','TB','2300'],['500','TB',null,null,'2000'],
].map(([from,fromUnit,to,toUnit,rate])=>({
 ...shared,pricingModel:'metered',resourceName:'فضای مازاد استاندارد',unit:'GB',quantity:null,rate,
 timeBasis:'usage',duration:null,instances:null,freeQuota:{quantity:'5',unit:'GB'},
 usageTiers:{from:{quantity:from,unit:fromUnit},to:to===null?null:{quantity:to,unit:toUnit},calculationMethod:'unknown'},
 minimumOrder:null,
}));
const hiops={...shared,pricingModel:'metered',resourceClass:'hiops',resourceName:'فضای Hiops',unit:'GB',quantity:null,rate:'9000',timeBasis:'usage',duration:null,instances:null,freeQuota:null,usageTiers:null,minimumOrder:null};
const transfer=[
 {from:{quantity:'20',unit:'GB'},to:{quantity:'20',unit:'TB'},rate:'850'},
 ...['700','600','500'].map(rate=>({from:null,to:null,rate})),
].map(({from,to,rate})=>({...shared,pricingModel:'metered',resourceName:'ترافیک دانلود مازاد',unit:'GB',quantity:null,rate,
 timeBasis:'usage',duration:null,instances:null,freeQuota:null,usageTiers:{from,to,calculationMethod:'unknown'},minimumOrder:null}));
const requests={...shared,pricingModel:'metered',resourceName:'درخواست خواندن و نوشتن مازاد',unit:'request',quantity:null,rate:null,
 timeBasis:'usage',duration:null,instances:null,freeQuota:null,usageTiers:null,minimumOrder:null,priceStatus:'unknown'};
const data={plans,storageTiers,hiops,downloadTrafficTiers:transfer,requestOverage:requests,
 notes:['ارقام تومان، عین اطلاعات ارسالی کاربر هستند و از صفحهٔ فارسی استخراج نشده‌اند.',
  'صفحهٔ فارسی هنگام بررسی محتوای تعرفه را برنگرداند؛ صفحهٔ انگلیسی فقط ظرفیت بسته‌ها را مستقل تأیید کرد و مبالغ را به یورو نشان داد.',
  'مرز دقیق پلکان‌های ۷۰۰، ۶۰۰ و ۵۰۰ تومان و روش محاسبهٔ پلکانی نامشخص است؛ نرخ درخواست‌ها و وضعیت مالیات نیز نامشخص‌اند.',
  'دیسک VM/کانتینر و فضای Object Storage خدمات مستقل‌اند.']};
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,connectionTimeoutMillis:5000});
try{
 await db.connect();
 const result=await db.query(`INSERT INTO pricing.unverified_tariff_submissions
  (submission_key,provider_id,service,source_url,reported_by,source_access_status,data)
  VALUES ($1,'arvan','object_storage',$2,'user','fa_page_unavailable_en_capacities_only',$3)
  ON CONFLICT (submission_key) DO UPDATE SET data=EXCLUDED.data RETURNING id,verification_status`,
 ['arvan-object-storage-user-report-2026-09-17',source,data]);
 console.log(result.rowCount?'Stored unverified Arvan Object Storage submission.':'Submission not stored.');
}catch(error){console.error('Submission storage failed:',error.code||'unavailable');process.exitCode=1;}
finally{await db.end();}
