// Observed in the official interactive calculator, not inferred from unit rates.
// Source state: Iran / Tehran11 (23) / Alma9.7-x64 (2), CPU 2, RAM 4096MB, disk 50GB.
export const parspackOfficialTariffs=[{
 id:'parspack-tehran11-alma-2-4-50',providerId:'parspack',provider:'پارس‌پک',
 service:'iaas',region:'Iran',datacenter:'Tehran11',os:'Alma9.7-x64',
 plan:'AlmaLinux · Tehran11 · 2 CPU / 4 GB / 50 GB',cpu:2,ram:4,disk:50,
 currency:'IRT',period:'month',billingPeriod:'day',pricingModel:'daily_projection',
 daily:52388,projectionDays:30,monthly:1571640,
 originalPrice:{amount:52388,currency:'IRT',period:'day'},
 priceKind:'published',verificationStatus:'official_calculator_observed',
 verifiedAt:'2026-09-18T11:06:33Z',availability:'unknown',
 source:'https://parspack.com/cloud-server',
 purchase:'https://my.parspack.com/server/client-area/iaas/store/cloud-server?tab=commercial&lo=23&os=2&r=4096&h=50&c=2',
 ipv4Included:null,ipv4Monthly:null,taxStatus:'unknown',
 evidence:'docs/parspack-price-verification.md',
 note:'مبلغ مقایسه حاصل نرخ روزانه × ۳۰ است؛ تعرفهٔ ماهانه نیست. مالیات، ترافیک، IP و بکاپ تأیید نشده‌اند.'
}];

// Broader verified snapshot retained from the catalog verification documented in docs/catalog.md.
const locations=[['ایران','Tehran11، Tehran2، Tehran16، Tehran3',31496],['آلمان','Frankfurt',39674],['هلند','Amsterdam',39674],['انگلیس','London1',39674],['ترکیه','Istanbul',45598],['فرانسه','Paris',49805],['سوئد','Stockholm',50313],['کانادا','Toronto2',56025]];
export const parspackOfficialPricing={
 providerId:'parspack',service:'iaas',source:'https://parspack.com/cloud-server',checkedAt:'2026-09-18',
 verificationStatus:'official_calculator_verified',currency:'IRT',billingPeriod:'day',projectionDays:30,
 quotes:[...locations.map(([country,datacenter,daily])=>({country,datacenter,cpu:1,ramGB:2,diskGB:25,os:'AlmaLinux',daily,projected30Days:daily*30})),
 ...[['Linux',2,4,50,52388],['Linux',4,8,100,89089],['Windows',1,4,50,44934]].map(([os,cpu,ramGB,diskGB,daily])=>({country:'ایران',datacenter:'Tehran11',os,cpu,ramGB,diskGB,daily,projected30Days:daily*30}))],
 additionalCosts:{
 autoBackup:{source:'https://docs.parspack.com/server/data-protection/auto-backup/',basis:'total_disk_GB_per_service_period',dailySchedulePerGB:2500,weeklySchedulePerGB:2000,monthlySchedulePerGB:1500},
 snapshot:{source:'https://docs.parspack.com/server/data-protection/snapshot/',basis:'total_disk_GB_times_versions_per_service_period',perGBPerVersion:1000,maxVersions:5}},
 unknowns:['مالیات، ترافیک و هزینهٔ IP اضافه نامشخص است.','مبلغ نهایی سفارش و موجودی پیش از خرید بررسی شود.']
};
