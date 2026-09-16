"""Reproducible dedicated dashboards, with explicit unavailable KPI panels."""
import json,pathlib
OUT=pathlib.Path('infra/dashboards'); OUT.mkdir(exist_ok=True)
DS={'type':'prometheus','uid':'foroushyar-prometheus'}
panels=[]
def stat(title,expr,unit='short',description=''):
    i=len(panels);panels.append({'id':i+1,'title':title,'type':'stat','datasource':DS,'gridPos':{'x':(i%3)*8,'y':(i//3)*5,'w':8,'h':5},'targets':[{'refId':'A','expr':expr,'instant':True}],'fieldConfig':{'defaults':{'unit':unit,'noValue':'No data / unavailable'},'overrides':[]},'options':{'reduceOptions':{'calcs':['lastNotNull'],'fields':'','values':False}},'description':description})
def note(title,text):
    i=len(panels);panels.append({'id':i+1,'title':title,'type':'text','gridPos':{'x':(i%3)*8,'y':(i//3)*5,'w':8,'h':5},'options':{'mode':'markdown','content':text}})
def save(uid,title):
    doc={'uid':uid,'title':'Torob Cloud · '+title,'schemaVersion':39,'version':1,'tags':['torob-cloud','local-development'],'editable':False,'timezone':'browser','refresh':'15s','time':{'from':'now-1h','to':'now'},'templating':{'list':[{'name':'source','label':'Activity source','type':'custom','query':'user,verification','current':{'text':'user','value':'user'},'options':[{'text':'user','value':'user','selected':True},{'text':'verification','value':'verification','selected':False}]}]},'panels':list(panels)}
    (OUT/(uid+'.json')).write_text(json.dumps(doc,indent=2));panels.clear()
J='{job="torob-cloud"}'
S='{job="torob-cloud",source="$source"}'
event=lambda name:f'sum(torob_events_30d{{job="torob-cloud",source="$source",event="{name}"}}) or (0 * max(torob_analytics_db_up{{job="torob-cloud"}} == 1))'
note('Topology & freshness','Local application → authenticated loopback SSH tunnel → private telemetry gateway → existing Prometheus. **Offline ≠ healthy.** Business aggregates continue from PostgreSQL while the development machine is offline. Raw application metrics disappear after 90 seconds.')
stat('Development machine online (0=offline)',f'torob_dev_online{J}')
stat('Seconds since telemetry received',f'time()-torob_telemetry_last_received_seconds{J}','s')
stat('Application requests / second',f'rate(torob_http_requests_total{J}[5m])','reqps')
stat('Application error share',f'rate(torob_http_errors_total{J}[5m])/clamp_min(rate(torob_http_requests_total{J}[5m]),0.000001)','percentunit')
stat('Request latency p95',f'histogram_quantile(0.95,rate(torob_http_duration_seconds_bucket{J}[5m]))','s')
stat('Local database connection',f'torob_db_up{J}')
stat('Read-only analytics connection',f'torob_analytics_db_up{J}')
stat('Process resident memory',f'torob_process_rss_bytes{J}','bytes')
stat('Process CPU / one core',f'torob_process_cpu_ratio{J}','percentunit')
stat('AI fallback share (rules mode)',f'torob_ai_fallback_total{J}/clamp_min(torob_ai_requests_total{J},1)','percentunit')
note('Live AI: not connected','No live model credential has been configured. Model latency, token usage, model failure rate, extraction accuracy and estimated AI cost are **unavailable**. Rule-based recommendations are explicitly labeled fallback; zero commercial AI cost is not asserted.')
save('torob-technical','Technical & AI')
note('Version 1 · fixed rolling 30 days','One project = one intake cohort. Events deduplicated by project + event + provider. Source **user** excludes verification traffic. Primary KPI: eligible evidence-backed recommendation → selected plan → click within 7 days of completion. New cohorts are provisional until the attribution window matures. Dashboard time picker does not change these SQL rolling windows.')
for name,title in [('intake_started','Intakes started'),('intake_completed','Intakes completed'),('recommendation_succeeded','Eligible evidence-backed recommendations'),('no_eligible_option','Intakes with no confirmed eligible option'),('comparison_viewed','Comparisons viewed'),('plan_selected','Plan selections (including provisional)'),('checklist_viewed','Checklists viewed'),('provider_clicked','Provider clicks (not purchases)'),('feedback_useful','Useful feedback'),('feedback_not_useful','Not useful feedback')]:stat(title,event(name))
stat('Successful recommendation rate',f'torob_funnel_recommended_30d{S}/torob_funnel_completed_30d{S}','percentunit')
stat('No confirmed eligible option rate',f'({event("no_eligible_option")})/torob_funnel_completed_30d{S}','percentunit')
stat('Primary KPI · mature successful referral share',f'torob_funnel_mature_referrals_30d{S}/torob_funnel_mature_completed_30d{S}','percentunit','No mature cohort means no data, never 0% success.')
stat('Provisional successful referral share',f'torob_funnel_successful_referrals_30d{S}/torob_funnel_completed_30d{S}','percentunit')
stat('Median intake → first eligible recommendation',f'torob_funnel_median_recommendation_seconds_30d{S}','s')
save('torob-product','Product funnel')
stat('Recommendations evaluated',f'torob_quality_evaluated_30d{S}')
stat('Require critical verification share',f'torob_quality_requires_verification_30d{S}/torob_quality_evaluated_30d{S}','percentunit')
stat('Complete cost estimates share',f'torob_quality_complete_estimates_30d{S}/torob_quality_evaluated_30d{S}','percentunit')
note('Catalog freshness','Snapshot: **2026-09-16**, stale after 7 days. Three official provider sources; dynamic prices and procurement availability require verification. No option is labeled eligible while critical data is unknown.')
stat('Oldest evaluated catalog snapshot age',f'torob_catalog_oldest_snapshot_age_seconds_30d{S}','s')
stat('Missing critical spec / price share',f'torob_catalog_missing_critical_30d{S}/torob_catalog_offers_evaluated_30d{S}','percentunit','Missing compute price, CPU or RAM in persisted evaluated options. This bounded definition does not claim full specification coverage.')
note('Hard-constraint violation rate','Not measured by an independent labeled evaluator yet. Selection of known ineligible options is blocked, but enforcement tests are not a measured production quality rate.')
note('AI extraction & corrected assumptions','Not connected: labeled AI extraction evaluation and tracking of changed recommendations after corrected assumptions. No accuracy percentage is fabricated.')
save('torob-quality','Recommendation quality')
stat('Qualified referrals by provider',f'torob_commercial_qualified_referrals_30d{S}')
stat('Provider click-through rate',f'torob_ctr_clicked_30d{S}/torob_ctr_compared_30d{S}','percentunit','Unique projects with comparison and provider click / unique projects with comparison in the rolling 30-day event window. Not purchase conversion.')
note('Verified conversions · NOT CONNECTED','No attribution integration or transaction source. Outbound provider clicks are **referrals**, never purchases.')
note('Attributed revenue · NOT CONNECTED','No transaction data or revenue attribution integration. Displayed as unavailable, never a fabricated zero.')
save('torob-commercial','Commercial')
stat('Read-only investigations',f'torob_sre_investigations_30d{S}')
stat('Investigations with sufficient evidence share',f'torob_sre_sufficient_evidence_30d{S}/torob_sre_investigations_30d{S}','percentunit')
stat('Inconclusive investigation share',f'torob_sre_inconclusive_30d{S}/torob_sre_investigations_30d{S}','percentunit')
note('Deployment and readiness · NOT EXECUTED','Local sandbox artifacts are available. No Docker runtime detected on the development machine. Deployment success, verified readiness latency and rollback success have no observations.')
note('Remediation & diagnosis · NOT MEASURED','No approved remediation or labeled fault scenarios were executed. Accepted proposals, correct diagnosis and recovery verification rates are unavailable. No faults were injected into shared services.')
note('Alert → report latency · NOT CONNECTED','Authenticated alert ingestion is not implemented in this initial integration. Manual investigations have real Prometheus evidence. No production MTTR improvement claim.')
save('torob-sre','SRE & deployment')
print('Generated 5 versioned dashboards.')
