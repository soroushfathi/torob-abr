// Public product-page snapshot. Rates are the displayed monthly bundle prices,
// not a complete quote for storage, requests, transfer overage, tax, or add-ons.
export const arvanStorageOfficial={
  providerId:'arvan',service:'object_storage',source:'https://www.arvancloud.ir/fa/products/cloud-storage',
  checkedAt:'2026-09-18',currency:'IRT',period:'month',verificationStatus:'official_product_page',
  plans:[
    {key:'basic',name:'پایه',monthly:0,storage:{quantity:5,unit:'GB'},traffic:{quantity:20,unit:'GB'}},
    {key:'growth',name:'رشد',monthly:1690000,storage:{quantity:500,unit:'GB'},traffic:{quantity:2,unit:'TB'}},
    {key:'professional',name:'حرفه‌ای',monthly:15900000,storage:{quantity:5,unit:'TB'},traffic:{quantity:20,unit:'TB'}},
    {key:'enterprise',name:'سازمانی',monthly:null,storage:'unlimited',traffic:'unlimited'},
  ],
  limitations:['نرخ‌های فضای مازاد، Hiops، دانلود مازاد و درخواست‌ها در صفحهٔ محصول عدد ندارند.','مالیات و مبلغ نهایی سفارش باید جداگانه بررسی شوند.'],
};
