"""Dedicated pricing support worker. Only fixed provider URLs; never executes app/user code."""
import datetime as dt, hashlib, json, pathlib, time, uuid, urllib.request, urllib.error, signal
from decimal import Decimal
import psycopg
from psycopg.types.json import Jsonb
from adapters import liara, arvan
ROOT=pathlib.Path('/opt/torob-cloud/pricing')
MAX_BYTES=6*1024*1024
STOP=False
def utc(): return dt.datetime.now(dt.timezone.utc)
def next_daily():
    now=utc();n=now.replace(hour=3,minute=15,second=0,microsecond=0)
    return n if n>now else n+dt.timedelta(days=1)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
def fetch(url):
    # Both allowlist and redirect policy are enforced here, regardless of DB contents.
    if url not in {liara.URL,arvan.SETTINGS}: raise ValueError('source_not_allowlisted')
    for attempt in range(3):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'TorobCloud-Pricing/1.0','Accept':'text/html,application/json','Accept-Encoding':'identity'})
            with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:
                if response.headers.get('Content-Length') and int(response.headers['Content-Length'])>MAX_BYTES: raise ValueError('source_too_large')
                body=response.read(MAX_BYTES+1)
                if len(body)>MAX_BYTES: raise ValueError('source_too_large')
                return body,response.status,response.headers.get('Content-Type','')
        except urllib.error.HTTPError as e:
            if e.code not in {429,500,502,503,504} or attempt==2:
                body=e.read(MAX_BYTES);return body,e.code,e.headers.get('Content-Type','')
        except (urllib.error.URLError,TimeoutError):
            if attempt==2: raise
        time.sleep(3*(attempt+1))
def comparable(p):
    if isinstance(p,list): return [comparable(v) for v in p]
    if isinstance(p,dict): return {k:comparable(v) for k,v in p.items() if k not in {'verifiedAt','retrievedAt','evidenceId','versionId'}}
    return p
def changes(old,new):
    before={p['id']:p for p in old};after={p['id']:p for p in new};diff=[];reasons=[]
    for key in sorted(before.keys()|after.keys()):
        a=before.get(key);b=after.get(key)
        if a is None or b is None or comparable(a)!=comparable(b): diff.append({'id':key,'before':a,'after':b})
        if a and b and a.get('monthly') and b.get('monthly') and abs(Decimal(str(b['monthly']))/Decimal(str(a['monthly']))-1)>Decimal('0.30'): reasons.append('تغییر قیمت بیش از ۳۰ درصد')
        if a and b:
            if b.get('pricingModel')=='metered' and comparable(a)!=comparable(b): reasons.append('تغییر ساختار، محدوده یا منابع تعرفهٔ مصرفی')
            if any(a.get(k)!=b.get(k) for k in ['ram','cpu','disk','capacityGB','region','tier','currency','period','availability','ipv4Monthly','egressPerGB']): reasons.append('تغییر مشخصات، موجودی یا هزینهٔ جانبی')
    removed=len(before.keys()-after.keys())
    if before and removed: reasons.append('حذف پلن یا تغییر هویت منبع؛ نیازمند بررسی')
    if before and removed/len(before)>.20: reasons.append('حذف گستردهٔ بیش از ۲۰ درصد منابع')
    return diff,sorted(set(reasons))
def process(conn,run):
    run_id,provider=run;adapter={'liara':liara,'arvan':arvan}.get(provider);started=time.monotonic();stages={k:'pending' for k in ['fetch','evidence','extraction','normalization','validation','publication']}
    with conn.transaction():
        conn.execute("UPDATE pricing.runs SET status='running',started_at=now() WHERE id=%s",(run_id,))
        conn.execute('UPDATE pricing.sources SET last_attempt=now(),next_run=%s WHERE id=%s',(next_daily(),provider))
    if not adapter:
        conn.execute("UPDATE pricing.runs SET status='unsupported',finished_at=now(),error_message='adapter استخراج قیمت پیاده‌سازی نشده است' WHERE id=%s",(run_id,));return
    parser=adapter.PARSER_VERSION;conn.execute('UPDATE pricing.runs SET parser_version=%s WHERE id=%s',(parser,run_id))
    try:
        url=adapter.URL if provider=='liara' else adapter.SETTINGS
        body,status,ctype=fetch(url);at=utc();evidence_id=str(uuid.uuid4());stages['fetch']='success' if status==200 else 'failed'
        conn.execute('INSERT INTO pricing.evidence(id,run_id,url,retrieved_at,http_status,sha256,body,bytes,content_type,expires_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(evidence_id,run_id,url,at,status,hashlib.sha256(body).hexdigest(),body,len(body),ctype,at+dt.timedelta(days=30)))
        stages['evidence']='stored'
        if status!=200: raise ValueError('access_challenge' if status in {401,403} else f'http_{status}')
        if provider=='liara' and 'html' not in ctype or provider=='arvan' and 'json' not in ctype: raise ValueError('unexpected_content_type')
        stages['extraction']='running';plans,config=adapter.parse(body,at.isoformat(),evidence_id)
        stages['extraction']='success' if provider=='liara' else 'metadata_only';stages['normalization']='success'
        if not plans or len(plans)>500 or len({p['id'] for p in plans})!=len(plans): raise ValueError('invalid_plan_count')
        for p in plans:
            if p['pricingModel']=='fixed_plan' and (p.get('monthly') is None or not 0<Decimal(str(p['monthly']))<Decimal('100000000000')): raise ValueError('invalid_fixed_price')
        previous=conn.execute("SELECT id,plans FROM pricing.versions WHERE provider_id=%s AND status='published' ORDER BY published_at DESC,id DESC LIMIT 1",(provider,)).fetchone()
        diff,reasons=changes(previous[1] if previous else [],plans);review=bool(reasons)
        stages['validation']='review' if review else 'valid';stages['publication']='held' if review else ('published' if provider=='liara' else 'metadata_published')
        version=str(uuid.uuid4())
        for p in plans:p['versionId']=version
        with conn.transaction():
            conn.execute('INSERT INTO pricing.versions(id,provider_id,run_id,base_version,parser_version,status,plans,verified_at,published_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',(version,provider,run_id,previous[0] if previous else None,parser,'candidate' if review else 'published',Jsonb(plans),at,None if review else utc()))
            conn.execute('UPDATE pricing.runs SET status=%s,finished_at=now(),stages=%s,extracted_count=%s,changed_count=%s,duration_seconds=%s,extraction_config=%s,diff=%s,review_reasons=%s WHERE id=%s',('review' if review else 'published',Jsonb(stages),len(plans),len(diff),time.monotonic()-started,Jsonb(config),Jsonb(diff),Jsonb(reasons),run_id))
            if not review: conn.execute('UPDATE pricing.sources SET last_success=%s WHERE id=%s',(at,provider))
    except Exception as error:
        code=str(error) if isinstance(error,ValueError) else 'source_or_storage_unavailable'
        # Never log connection strings, arbitrary response bodies or unsanitized exception text.
        messages={'access_challenge':'منبع دسترسی را محدود کرده؛ چالش دور زده نشد.','source_or_storage_unavailable':'منبع یا ذخیره‌سازی در دسترس نیست؛ آخرین نسخهٔ معتبر حفظ شد.'}
        active=next((k for k,v in stages.items() if v in {'pending','running'}),'validation');stages[active]='failed';stages['publication']='not_published'
        conn.execute("UPDATE pricing.runs SET status='failed',finished_at=now(),stages=%s,error_code=%s,error_message=%s,duration_seconds=%s WHERE id=%s",(Jsonb(stages),code[:120],messages.get(code,'استخراج یا اعتبارسنجی منبع کامل نشد؛ آخرین نسخهٔ معتبر حفظ شد.'),time.monotonic()-started,run_id))
def main():
    config=json.loads((ROOT/'worker.json').read_text());last_cleanup=0
    while not STOP:
        try:
            with psycopg.connect(host='127.0.0.1',port=5432,dbname='torob_cloud',user='torob_price_worker',password=config['password'],connect_timeout=5,autocommit=True,options='-c statement_timeout=5000') as conn:
                if not conn.execute('SELECT pg_try_advisory_lock(716410)').fetchone()[0]: time.sleep(30);continue
                # Global lock proves no previous worker is still running; interrupted runs become failures.
                conn.execute("UPDATE pricing.runs SET status='failed',finished_at=now(),error_code='worker_interrupted',error_message='اجرای worker قطع شد؛ نسخهٔ قبلی محفوظ است.' WHERE status='running'")
                while not STOP:
                    conn.execute("INSERT INTO pricing.runs(id,provider_id,trigger) SELECT gen_random_uuid(),id,'scheduled' FROM pricing.sources WHERE enabled AND next_run<=now() ON CONFLICT DO NOTHING")
                    row=conn.execute("SELECT r.id,r.provider_id FROM pricing.runs r JOIN pricing.sources s ON s.id=r.provider_id WHERE r.status='queued' AND s.enabled ORDER BY r.created_at LIMIT 1").fetchone()
                    if row:
                        key='pricing:'+row[1];conn.execute('SELECT pg_advisory_lock(hashtext(%s))',(key,))
                        try: process(conn,row)
                        finally: conn.execute('SELECT pg_advisory_unlock(hashtext(%s))',(key,))
                        time.sleep(3)
                    else: time.sleep(15)
                    if time.monotonic()-last_cleanup>3600:
                        conn.execute('UPDATE pricing.evidence SET body=NULL WHERE body IS NOT NULL AND expires_at<now()')
                        conn.execute("UPDATE pricing.estimates SET status='failed',finished_at=now(),result='{\"status\":\"interrupted\",\"error\":\"برآورد قطع شد؛ قیمت منتشر نشد.\"}' WHERE status='running' AND started_at<now()-interval '5 minutes'")
                        # Total retained raw evidence cap: 100 MiB. Keep hashes/metadata permanently.
                        conn.execute('WITH sizes AS (SELECT id,sum(bytes) OVER(ORDER BY retrieved_at DESC,id DESC) AS total FROM pricing.evidence WHERE body IS NOT NULL) UPDATE pricing.evidence SET body=NULL WHERE id IN (SELECT id FROM sizes WHERE total>104857600)')
                        last_cleanup=time.monotonic()
        except Exception:
            print('pricing worker connection unavailable; retrying',flush=True);time.sleep(30)
def stop(*args):
    global STOP
    STOP=True
if __name__=='__main__':
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop);main()
