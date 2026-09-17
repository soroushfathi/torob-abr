"""Private telemetry ingress and bounded read-only SRE evidence. No shell/Docker access."""
import json, time, math, threading, pathlib, hmac, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import psycopg
CONFIG=json.loads(pathlib.Path('/opt/torob-cloud/gateway.json').read_text())
STATE=pathlib.Path('/opt/torob-cloud/state/snapshot.json')
LOCK=threading.Lock()
try: snapshot=json.loads(STATE.read_text())
except (FileNotFoundError,json.JSONDecodeError): snapshot={'received':0,'metrics':[]}
NAMES={'torob_http_requests_total','torob_http_errors_total','torob_http_duration_seconds_sum','torob_http_duration_seconds_count','torob_http_duration_seconds_bucket','torob_db_up','torob_process_rss_bytes','torob_process_cpu_ratio','torob_ai_requests_total','torob_ai_fallback_total','torob_ai_failures_total','torob_ai_tokens_total','torob_ai_duration_seconds_sum','torob_ai_duration_seconds_count'}
QUERIES={
 'latency':{'requests_per_second':'rate(torob_http_requests_total{job="torob-cloud"}[5m])','error_ratio':'rate(torob_http_errors_total{job="torob-cloud"}[5m]) / clamp_min(rate(torob_http_requests_total{job="torob-cloud"}[5m]),0.000001)','latency_p95_seconds':'histogram_quantile(0.95,rate(torob_http_duration_seconds_bucket{job="torob-cloud"}[5m]))'},
 'resources':{'cpu_ratio':'torob_process_cpu_ratio{job="torob-cloud"}','rss_bytes':'torob_process_rss_bytes{job="torob-cloud"}'},
 'database':{'local_database_up':'torob_db_up{job="torob-cloud"}','analytics_database_up':'torob_analytics_db_up{job="torob-cloud"}'}
}
def validate(payload):
    if not isinstance(payload,dict) or set(payload)!={'metrics'}: raise ValueError()
    samples=payload['metrics']
    if not isinstance(samples,list) or len(samples)>80: raise ValueError()
    seen=set()
    for s in samples:
        if not isinstance(s,dict) or set(s)!={'name','value','labels'}: raise ValueError()
        if s['name'] not in NAMES or not isinstance(s['value'],(int,float)) or not math.isfinite(s['value']) or s['value']<0: raise ValueError()
        labels=s['labels']
        if not isinstance(labels,dict) or set(labels)-{'le'}: raise ValueError()
        if labels and (s['name']!='torob_http_duration_seconds_bucket' or str(labels['le']) not in {'0.01','0.05','0.1','0.25','0.5','1','2.5','5','10','+Inf'}): raise ValueError()
        identity=(s['name'],str(labels))
        if identity in seen: raise ValueError()
        seen.add(identity)
    if not any(s['name']=='torob_db_up' for s in samples): raise ValueError()
    return samples
business={'lines':[], 'healthy':0, 'at':0}
pricing={'lines':[], 'healthy':0}
def metric(name,value,**labels):
    suffix='{'+','.join(k+'='+json.dumps(str(v)) for k,v in sorted(labels.items()))+'}' if labels else ''
    return f'{name}{suffix} {float(value)}'
def aggregate():
    while True:
        try:
            with psycopg.connect(host='127.0.0.1',port=5432,dbname='torob_cloud',user='torob_analytics',password=CONFIG['password'],connect_timeout=4,options='-c statement_timeout=4000') as conn:
                lines=[]
                with conn.cursor() as cur:
                    cur.execute('SELECT source,name,provider,value FROM app.event_counts')
                    for source,name,provider,value in cur: lines.append(metric('torob_events_30d',value,source=source,event=name,provider=provider))
                    for view,prefix in [('funnel_kpis','funnel'),('commercial_kpis','commercial'),('commercial_summary','ctr'),('catalog_quality','catalog'),('quality_kpis','quality'),('incident_kpis','sre')]:
                        cur.execute('SELECT * FROM app.'+view)
                        fields=[c.name for c in cur.description]
                        for row in cur:
                            record=dict(zip(fields,row)); labels={k:record.pop(k) for k in ['source','provider'] if k in record}
                            for key,value in record.items():
                                if value is not None: lines.append(metric('torob_'+prefix+'_'+key+'_30d',value,**labels))
                business.update(lines=lines,healthy=1,at=time.time())
        except Exception: business.update(lines=[],healthy=0,at=time.time())
        time.sleep(15)
def aggregate_pricing():
    while True:
        try:
            lines=[]
            with psycopg.connect(host='127.0.0.1',port=5432,dbname='torob_cloud',user='torob_analytics',password=CONFIG['password'],connect_timeout=4,options='-c statement_timeout=4000') as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT * FROM pricing.metrics')
                    fields=[c.name for c in cur.description]
                    for row in cur:
                        record=dict(zip(fields,row));provider=record.pop('provider');finished=record.pop('last_finished');valid=record.pop('last_valid')
                        lines.append(metric('torob_pricing_enabled',record.pop('enabled'),provider=provider))
                        if finished:
                            lines.append(metric('torob_pricing_last_finished_seconds',finished.timestamp(),provider=provider))
                            for name,value in record.items():
                                if value is not None:lines.append(metric('torob_pricing_'+name,value,provider=provider))
                        if valid:lines.append(metric('torob_pricing_catalog_age_seconds',max(0,time.time()-valid.timestamp()),provider=provider))
            pricing.update(lines=lines,healthy=1)
        except Exception:pricing.update(lines=[],healthy=0)
        time.sleep(30)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass # Never log tokens, payloads or raw request paths.
    def setup(self):
        super().setup(); self.connection.settimeout(5)
    def send(self,status,data,ctype='application/json'):
        raw=data.encode() if isinstance(data,str) else json.dumps(data,allow_nan=False).encode()
        self.send_response(status); self.send_header('Content-Type',ctype); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def authorized(self): return hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+CONFIG['token'])
    def do_POST(self):
        if self.server.server_address[1]!=19100 or self.path!='/ingest' or not self.authorized(): return self.send(403,{'error':'forbidden'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>32768: raise ValueError()
            metrics=validate(json.loads(self.rfile.read(size)))
            new={'received':time.time(),'metrics':metrics}
            with LOCK:
                global snapshot
                tmp=STATE.with_suffix('.tmp'); tmp.write_text(json.dumps(new)); tmp.replace(STATE); snapshot=new
            self.send(200,{'accepted':len(metrics)})
        except (ValueError,TimeoutError): self.send(400,{'error':'invalid bounded telemetry payload'})
    def do_GET(self):
        if self.path=='/metrics' and self.server.server_address[1]==19101:
            if self.client_address[0] != CONFIG['prometheus_ip']: return self.send(403,{'error':'forbidden'})
            with LOCK: current=dict(snapshot)
            age=time.time()-current['received']; online=0<=age<90
            lines=[metric('torob_dev_online',int(online)),metric('torob_telemetry_last_received_seconds',current['received']),metric('torob_analytics_db_up',business['healthy']),metric('torob_analytics_last_refresh_seconds',business['at']),metric('torob_conversion_integration_available',0),metric('torob_revenue_integration_available',0),metric('torob_ai_live_integration_available',0)]
            if online: lines.extend(metric(s['name'],s['value'],**s['labels']) for s in current['metrics'])
            lines.extend(business['lines'])
            lines.append(metric('torob_pricing_metrics_available',pricing['healthy']))
            lines.extend(pricing['lines'])
            return self.send(200,'\n'.join(lines)+'\n','text/plain; version=0.0.4')
        if self.server.server_address[1]!=19100 or not self.authorized(): return self.send(403,{'error':'forbidden'})
        kind=self.path.removeprefix('/evidence/')
        if kind not in QUERIES: return self.send(404,{'error':'unknown investigation'})
        now=time.time(); evidence=[]
        try:
            queries={'online':'torob_dev_online{job="torob-cloud"} and on(job) (up{job="torob-cloud"} == 1)',**QUERIES[kind]}
            for name,query in queries.items():
                url='http://127.0.0.1:9090/api/v1/query?'+urllib.parse.urlencode({'query':query,'time':now,'timeout':'3s'})
                with urllib.request.urlopen(url,timeout=4) as response:
                    raw=response.read(262145)
                if len(raw)>262144: raise ValueError()
                data=json.loads(raw)
                if data.get('status')!='success': raise ValueError()
                evidence.append({'name':name,'query':query,'timestamp':now,'result':data['data']['result']})
            self.send(200,{'resource':'torob-cloud-local','source':'existing Prometheus','observedAt':now,'window':'5m rates; instantaneous gauges','evidence':evidence})
        except Exception: self.send(503,{'error':'monitoring integration unavailable'})
if __name__=='__main__':
    threading.Thread(target=aggregate,daemon=True).start()
    threading.Thread(target=aggregate_pricing,daemon=True).start()
    threading.Thread(target=ThreadingHTTPServer((CONFIG['bridge'],19101),Handler).serve_forever,daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1',19100),Handler).serve_forever()
