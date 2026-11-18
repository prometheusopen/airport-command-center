// Rendered visible text across all pages/tabs/storefront steps/boards; grep for forbidden words.
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
const BASE=process.argv[2]||'http://127.0.0.1:8796/';
const BAD=[/aerodatabox/i,/aviationstack/i,/twilio/i,/instacart/i,/reina/i,/lemus/i,/la bonita/i,/\breign\b/i,/11360/,/clayton/i,/\bAI\b/,/24\/7/,/airport-hotel tools included/i,/soc ?2/i,/github/i,/\bMIT\b/,/code is public/i,/flightaware/i,/flightview/i];
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const pg=await b.newPage({viewport:{width:1440,height:900}});let all='';
for(const p of ['index.html','products.html','pricing.html','about.html','security.html','founder.html','demo.html','board.html?property=demo-hotel&screen=lobby-1','board.html?property=demo-hotel&screen=lobby-2','board.html?property=demo-cafe&screen=gate-b-1']){
 await pg.goto(BASE+p,{waitUntil:'load'}); await pg.waitForTimeout(p.includes('board')?5000:800); all+='\n'+await pg.evaluate(()=>document.body.innerText+' '+[...document.querySelectorAll('[aria-label],[title],[alt]')].map(e=>(e.getAttribute('aria-label')||'')+' '+(e.title||'')+' '+(e.alt||'')).join(' '));
 if(p==='demo.html'){ for(const t of ['energy','inventory','shuttle','count','lobby','storefront']){ await pg.click('#tab-'+t); await pg.waitForTimeout(t==='lobby'||t==='shuttle'?6000:800); all+='\n'+await pg.evaluate(()=>document.body.innerText); }
  const f0=pg.frames().find(x=>x.url().includes('board.html')); if(f0) all+='\n'+await f0.evaluate(()=>document.body.innerText);
  await pg.goto('about:blank'); await pg.goto(BASE+'demo.html#storefront',{waitUntil:'load'}); await pg.waitForTimeout(800);
  for(const l of ['es','en']){ await pg.click(`[data-lang=${l}]`); for(let i=0;i<7;i++){ await pg.click(`.sf-step[data-i="${i}"]`); for(const a of await pg.$$eval('#sf-root [data-act]',x=>x.map(e=>e.dataset.act))) { const el=await pg.$(`#sf-root [data-act=${a}]`); if(el) await el.click().catch(()=>{}); } all+='\n'+await pg.evaluate(()=>document.querySelector('#sf-root').innerText); } }
 } }
let hits=0; for(const r of BAD){ const m=all.match(new RegExp(r.source,r.flags.includes('i')?'gi':'g')); if(m){hits+=m.length; console.log('HIT',r,m.length, all.slice(Math.max(0,all.search(r)-60),all.search(r)+60).replace(/\n/g,' '));} }
console.log('rendered chars',all.length,'forbidden hits',hits); await b.close();})();
