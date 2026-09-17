"""Public API URLs identified in the calculator's published JS; no account access."""
import json
PARSER_VERSION='arvan-calculator-1.0.0'
PAGE='https://panel.arvancloud.ir/calculator'
SETTINGS='https://napi.arvancloud.ir/alak/v1/calculator-settings'
CALCULATE='https://napi.arvancloud.ir/chortke/v1/calculate-resources'
def parse(body,at,evidence_id):
    data=json.loads(body)['data'];products=data['products'];tariffs=[]
    for product in products:
        if product['name'] not in {'iaas','paas','devops','support'}: continue
        metrics=product['metrics']
        if not metrics or len({m['key'] for m in metrics})!=len(metrics): raise ValueError('منابع ماشین‌حساب ناقص یا تکراری است')
        for m in metrics:
            if not all(k in m for k in ['id','key','unit','calculationType']): raise ValueError('ساختار منبع تغییر کرده است')
        # Settings are tariff metadata, not a numerical rate schedule. Values.value is a UI default, never a rate.
        tariffs.append({'id':f"arvan:metered:{product['name']}",'providerId':'arvan','provider':'ابر آروان','pricingModel':'metered','service':product['name'],'plan':product['title'],'region':'per_configuration','tier':'per_configuration','period':'per_configuration','monthly':None,'currency':'IRR','source':SETTINGS,'calculatorSource':PAGE,'verifiedAt':at,'evidenceId':evidence_id,'verificationStatus':'metadata_verified_rates_unavailable','unitRate':None,'freeQuota':None,'usageTiers':None,'minimumOrder':None,'taxStatus':'unknown','additionalCosts':['tax','backup','support'],'product':product,'managedCapabilities':None,'compatibilityStatus':'calculator_bounds_only','notes':['مقدار پیش‌فرض صفحه نرخ نیست.','محدودیت فرم ماشین‌حساب، تأیید قابلیت سفارش ترکیب CPU/RAM نیست.','نرخ واحد و پله‌های قابل تعمیم منتشر نشده‌اند؛ هر برآورد نیازمند محاسبهٔ همان پیکربندی است.']})
    for tariff in tariffs:
        p=tariff['product']
        tariff['components']=[{'provider':'arvan','service':p['name'],'region':r['key'],'resourceClass':m['key'],'resourceName':m['title'],'resourceKey':m['key'],'unit':m['unit'],'quantity':None,'rate':None,'originalCurrency':'IRR','timeBasis':m['calculationType'],'duration':None,'instances':None,'freeQuota':None,'usageTiers':None,'minimumOrder':None,'calculatorBounds':m.get('values'),'taxStatus':'unknown','additionalCostsStatus':'unknown','source':SETTINGS,'retrievedAt':at,'evidenceId':evidence_id,'verificationStatus':'metadata_only_rates_unavailable'} for r in p.get('regions',[{'key':'not_specified'}]) for m in p['metrics']]
    if not {'iaas','paas'}.issubset({p['service'] for p in tariffs}): raise ValueError('خدمات اصلی ماشین‌حساب استخراج نشد')
    return tariffs,{'coverage':[p['service'] for p in tariffs],'rates':'unavailable','calculation':'public_api_exact_configuration','configuration':None}
