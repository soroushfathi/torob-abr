// Public read-only fetches; never reads local credentials or authenticates to providers.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {providers,catalog} from '../src/catalog.js';
const results=[];
// A small bounded pool avoids flooding providers and keeps every failure in the report.
for(let i=0;i<providers.length;i+=3){
 const batch=await Promise.all(providers.slice(i,i+3).map(async p=>{
  try{
   const response=await fetch(p.source,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'TorobCloud-CatalogReview/1.0'}});
   const body=await response.text();
   return {id:p.id,url:p.source,resolvedUrl:response.url,status:response.status,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),requiresManualPriceReview:true};
  }catch{return {id:p.id,url:p.source,status:'fetch_failed',requiresManualPriceReview:true};}
 }));
 results.push(...batch);batch.forEach(r=>console.log(`${r.id}: ${r.status}; manual price review required`));
}
await mkdir('.runtime',{recursive:true});
await writeFile('.runtime/catalog-source-check.json',JSON.stringify({checkedAt:new Date().toISOString(),catalogVersion:catalog.version,results},null,2));
console.log('Report saved. Catalog values and retrieval dates were not changed.');
