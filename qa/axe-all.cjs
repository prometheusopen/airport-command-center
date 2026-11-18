// axe on every page (desktop + phone) plus each Lobby screen state.
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');const fs=require('fs');const AXE=fs.readFileSync('/workspace/qc-site/axe.min.js','utf8');
const BASE=process.argv[2]||'http://127.0.0.1:8796/'; const TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];
const PAGES=['index.html','products.html','pricing.html','about.html','security.html','founder.html','demo.html'];
const C=(sel)=>`document.querySelector('${sel}').click()`;
const LOBBY=[['lobby-gps-on',''],['lobby-gps-off',C('.acc-gps')],['skin-graphite',C('.acc-gps')+';'+C('[data-skin-btn=graphite]')],['skin-espresso',C('.acc-gps')+';'+C('[data-skin-btn=espresso]')],['skin-caramel',C('.acc-gps')+';'+C('[data-skin-btn=caramel]')],['screen-only',C('[data-view-btn=screen]')],['split-phone',C('[data-view-btn=split]')],['faa-demo',C('.acc-gps')+";var d=document.querySelector('.acc-demo');if(d&&!d.hidden)d.click()"],['lobby-paused',C('.acc-pause')],['restaurant',C('[data-scene-btn=restaurant]')],['restaurant-ad',C('[data-scene-btn=restaurant]')+"; new Promise(r=>setTimeout(r,21500))"],['takeover',"new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('.take.on')){clearInterval(t);r()}},300)})"]];
const BOARDS=['board.html?property=demo-hotel&screen=lobby-1','board.html?property=demo-hotel&screen=lobby-2&skin=espresso','board.html?property=demo-cafe&screen=gate-b-1&skin=caramel'];
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});let total=0;const out={};
for(const [vp,w,h,m] of [['desktop',1440,900,false],['phone',390,844,true]]){
 const run=async(url,ev,name)=>{const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m,bypassCSP:true});const pg=await ctx.newPage();
  await pg.goto(BASE+url,{waitUntil:'load'});await pg.waitForTimeout(/lobby|board/.test(url)?4000:1500); if(ev) await pg.evaluate(ev); await pg.waitForTimeout(800);
  await pg.addScriptTag({content:AXE});const r=await pg.evaluate(async(T)=>(await axe.run(document,{runOnly:{type:'tag',values:T}})).violations.map(v=>({id:v.id,n:v.nodes.length,t:v.nodes.slice(0,3).map(x=>x.target.join(' '))})),TAGS);
  const n=r.reduce((a,v)=>a+v.n,0); total+=n; out[vp+' '+name]=r; console.log(vp,name,n,n?JSON.stringify(r):''); await ctx.close();};
 if(!process.env.LOBBY_ONLY) for(const p of PAGES) await run(p,'',p);
 for(const [n,ev] of LOBBY) await run('demo.html#lobby',ev,n);
 for(const u of BOARDS) await run(u,'',u);
}
console.log('TOTAL violations',total); fs.writeFileSync(process.argv[3]||'/tmp/axe.json',JSON.stringify(out,null,1)); await b.close();})();
