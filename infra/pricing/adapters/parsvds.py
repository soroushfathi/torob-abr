"""Extract only the eleven monthly Iran VPS rows on ParsVDS's official page."""
import re
from decimal import Decimal
from html.parser import HTMLParser

PARSER_VERSION='parsvds-iran-vps-1.0.0'
URL='https://parsvds.com/virtual-server/iran-ssd/'
EXPECTED={'IR_VPS_GH','IR_VPS_e2',*(f'IR_VPS_{n:02d}' for n in range(1,10))}
DIGITS=str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')

class Node:
    def __init__(self,tag='',attrs=()): self.tag=tag;self.attrs=dict(attrs);self.children=[]
    def text(self): return ' '.join(c.text() if isinstance(c,Node) else c for c in self.children).strip()
    def find(self,cls):
        found=[]
        for child in self.children:
            if isinstance(child,Node):
                if cls in child.attrs.get('class','').split(): found.append(child)
                found.extend(child.find(cls))
        return found

class Document(HTMLParser):
    VOID={'img','br','meta','link','input','hr','source','wbr','area','base','embed','param','track','col'}
    def __init__(self): super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        node=Node(tag,attrs);self.stack[-1].children.append(node)
        if tag not in self.VOID:self.stack.append(node)
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,data):self.stack[-1].children.append(data)

def number(value):
    match=re.search(r'\d[\d,٬]*',value.translate(DIGITS))
    if not match:raise ValueError('عدد پلن پارس وی دی اس ناموجود است')
    return int(match[0].replace(',','').replace('٬',''))

def parse(body,at,evidence_id):
    html=body.decode('utf-8');doc=Document();doc.feed(html)
    rows=doc.root.find('server-tabls-row-vps')
    if len(rows)!=11 or 'قیمت/ماهانه' not in doc.root.text() or 'NEWIR' not in html or '۴۹' not in html:
        raise ValueError('پوشش پلن ماهانه یا هزینهٔ جانبی پارس وی دی اس تغییر کرده است')
    plans=[]
    for row in rows:
        cells=[n for n in row.children if isinstance(n,Node) and n.tag=='div']
        if len(cells)!=9:raise ValueError('ستون پلن پارس وی دی اس تغییر کرده است')
        match=re.search(r'IR_VPS_[A-Za-z0-9]+',cells[0].text())
        if not match:raise ValueError('شناسهٔ پلن پارس وی دی اس ناموجود است')
        name=match[0];cpu=number(cells[2].text());ram=number(cells[3].text());disk=number(cells[4].text());traffic=number(cells[5].text());monthly=number(cells[8].text())
        disk_type='NVMe' if 'NVME' in cells[4].text().upper() else 'SSD' if 'SSD' in cells[4].text().upper() else None
        if not disk_type or not 0<monthly<100000000000:raise ValueError('دیسک یا قیمت پلن پارس وی دی اس نامعتبر است')
        plans.append({'id':f'parsvds:iaas:Iran:month:{name}','providerId':'parsvds','provider':'پارس‌وی‌دی‌اس','pricingModel':'fixed_plan','service':'iaas','region':'Iran','tier':'standard','period':'month','plan':name,'monthly':str(monthly),'hourly':None,'currency':'IRT','originalPrice':{'amount':str(monthly),'currency':'IRT','period':'month'},'ram':ram,'cpu':cpu,'disk':disk,'diskType':disk_type,'trafficGB':traffic,'ipv4Included':None,'ipv4Monthly':None,'priceKind':'published','availability':'unknown','source':URL,'verifiedAt':at,'evidenceId':evidence_id,'verificationStatus':'official_page_extracted','taxStatus':'unknown','trafficAddon':{'quantityGB':100,'amount':49000,'currency':'IRT'},'promotion':{'code':'NEWIR','discountPercent':20,'minPeriodMonths':1,'applied':False},'additionalCosts':['backup','tax','traffic_overage','operations']})
    if {p['plan'] for p in plans}!=EXPECTED:raise ValueError('فهرست پلن‌های پارس وی دی اس تغییر کرده است')
    return plans,{'coverage':{'iaas':len(plans)},'region':'Iran','period':'month','discountApplied':False,'trafficAddonIncluded':False}
