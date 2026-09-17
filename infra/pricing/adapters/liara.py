"""Official SSR pricing only. No JS execution, guessed API or aggregate LD-JSON pricing."""
import re, hashlib
from html.parser import HTMLParser
from decimal import Decimal
PARSER_VERSION='liara-ssr-1.0.0'
URL='https://liara.ir/pricing/'
class Node:
    def __init__(self,tag='',attrs=()): self.tag=tag;self.attrs=dict(attrs);self.children=[]
    def text(self): return ' '.join(c.text() if isinstance(c,Node) else c for c in self.children).strip()
    def find(self,tag=None,cls=None):
        found=[]
        for c in self.children:
            if isinstance(c,Node):
                if (tag is None or c.tag==tag) and (cls is None or cls in c.attrs.get('class','').split()): found.append(c)
                found.extend(c.find(tag,cls))
        return found
class Document(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag not in {'img','br','meta','link','input','hr','source','wbr','area','base','embed','param','track','col'}: self.stack.append(n)
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag: self.stack=self.stack[:i];break
    def handle_data(self,data): self.stack[-1].children.append(data)
def number(text):
    t=text.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')).replace(',','').replace('٬','').replace('٫','.')
    m=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(تومان|ریال)?\s*',t)
    if not m: raise ValueError('عدد یا واحد تعرفه قابل تطبیق نیست')
    return Decimal(m[1]), 'IRR' if m[2]=='ریال' else 'IRT'
def parse(body,at,evidence_id):
    html=body.decode('utf-8'); headings=list(re.finditer(r'<h2[^>]*>(.*?)</h2>',html,re.S));plans=[]
    services={'پلتفرم (PaaS)':'paas','دیتابیس (DBaaS)':'dbaas','سرور مجازی ابری':'iaas'}
    for i,h in enumerate(headings):
        service=services.get(h[1]);segment=html[h.start():headings[i+1].start() if i+1<len(headings) else len(html)]
        if not service and 'Object Storage' not in h[1]: continue
        doc=Document();doc.feed(segment);root=doc.root
        if service:
            rows=root.find(cls='item')
            if len(rows)<3: raise ValueError('بخش منابع لیارا ناقص است')
            for row in rows:
                cells=[c for c in row.children if isinstance(c,Node) and c.tag=='div']
                if len(cells)!=6: raise ValueError('ساختار ستون تعرفه تغییر کرده است')
                ps=cells[0].find('p');name=ps[-1].text() if ps else ''
                monthly,currency=number(cells[1].text());hourly,hcurrency=number(cells[2].text())
                if currency!=hcurrency: raise ValueError('ارز ساعتی و ماهانه متفاوت است')
                values=[number(c.text())[0] for c in cells[3:]]
                identity=hashlib.sha256(name.encode()).hexdigest()[:12]
                plan={'id':f'liara:{service}:Iran:month:base:{identity}','providerId':'liara','provider':'لیارا','pricingModel':'fixed_plan','service':service,'region':'Iran','tier':'base' if service!='iaas' else 'standard','period':'month','plan':name,'monthly':str(monthly/(10 if currency=='IRR' else 1)),'hourly':str(hourly),'currency':'IRT','originalPrice':{'amount':str(monthly),'currency':currency,'period':'month'},'ram':float(values[0]),'cpu':float(values[1]),'disk':float(values[2]),'priceKind':'published','availability':'unknown','source':URL,'verifiedAt':at,'evidenceId':evidence_id,'taxStatus':'unknown','additionalCosts':['traffic','backup','tax'],'freeQuota':None,'usageTiers':None,'minimumOrder':None}
                if service=='iaas':
                    text=root.text().translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹','0123456789'))
                    ip=re.search(r'ماهانه\s+(\d+)\s+هزار تومان.*?ساعتی\s+(\d+)\s+تومان.*?IPv4',text)
                    traffic=re.search(r'هر گیگابایت ترافیک دانلود،\s*([\d,]+)\s*تومان',text)
                    if not ip or not traffic or 'موقعیت تمامی پلن' not in text or 'ایران' not in text: raise ValueError('منطقه یا هزینهٔ IP و ترافیک استخراج نشد')
                    plan.update(ipv4Monthly=int(ip[1])*1000,ipv4Hourly=ip[2],ipv4Included=False,egressPerGB=int(traffic[1].replace(',','')))
                plans.append(plan)
        else:
            prices=root.find(cls='price')
            if len(prices)!=1: raise ValueError('قیمت پیکربندی فضای فایل مشخص نیست')
            ps=prices[0].find('p')
            month,currency=number(ps[0].text().split(':')[-1]);hour,hcurrency=number(ps[1].text().split(':')[-1]);size=re.search(r'(\d+)\s*GB',ps[2].text())
            if not size or currency!=hcurrency: raise ValueError('واحد فضای فایل مشخص نیست')
            # Only the SSR-selected quantity is a known quote. Never infer a per-GB rate or other slider positions.
            plans.append({'id':f'liara:object:Iran:month:base:{size[1]}','providerId':'liara','provider':'لیارا','pricingModel':'fixed_plan','service':'object','region':'Iran','tier':'base','period':'month','plan':f'فضای فایل {size[1]}GB','capacityGB':int(size[1]),'monthly':str(month/(10 if currency=='IRR' else 1)),'hourly':str(hour),'currency':'IRT','originalPrice':{'amount':str(month),'currency':currency,'period':'month'},'unitRate':None,'priceScope':'exact_quantity_only','priceKind':'published','availability':'unknown','source':URL,'verifiedAt':at,'evidenceId':evidence_id,'taxStatus':'unknown'})
    counts={s:sum(p['service']==s for p in plans) for s in ['paas','dbaas','iaas','object']}
    if any(v==0 for v in counts.values()) or len({p['id'] for p in plans})!=len(plans): raise ValueError('استخراج کامل یا یکتای خدمات لیارا تأیید نشد')
    return plans,{'coverage':counts,'tierCoverage':'SSR base only; silver/gold not extracted','objectCoverage':'exact visible quantity only'}
