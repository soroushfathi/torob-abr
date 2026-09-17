// Finite decimal arithmetic using integers, without floating point or intermediate rounding.
function split(value) {
 const s=String(value);if(!/^-?\d{1,24}(?:\.\d{1,18})?$/.test(s))throw new Error('مقدار مالی decimal معتبر نیست');
 const [whole,fraction='']=s.replace('-','').split('.');return {n:BigInt(whole+fraction)*(s.startsWith('-')?-1n:1n),scale:fraction.length};
}
function format(n,scale) {
 const sign=n<0n?'-':'';let s=(n<0n?-n:n).toString().padStart(scale+1,'0');
 if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);return sign+s.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
}
export function add(a,b){const x=split(a),y=split(b),scale=Math.max(x.scale,y.scale);return format(x.n*10n**BigInt(scale-x.scale)+y.n*10n**BigInt(scale-y.scale),scale);}
export function multiply(a,b){const x=split(a),y=split(b);return format(x.n*y.n,x.scale+y.scale);}
export function subtract(a,b){return add(a,String(b).startsWith('-')?String(b).slice(1):'-'+b);}
export function compare(a,b){const s=subtract(a,b);return s==='0'?0:s.startsWith('-')?-1:1;}
export function toman(irr){const x=split(irr);return format(x.n,x.scale+1);}
export function sum(values){return values.reduce((a,b)=>add(a,b),'0');}
export function onStep(value,min,step){const delta=split(subtract(value,min)),s=split(step),scale=Math.max(delta.scale,s.scale);return s.n>0n&&(delta.n*10n**BigInt(scale-delta.scale))%(s.n*10n**BigInt(scale-s.scale))===0n;}
