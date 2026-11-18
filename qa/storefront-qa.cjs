// Storefront (rendering) + Shuttle tab + Code column: axe, console/CSP errors, screenshots (desktop + phone).
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');const fs=require('fs');const AXE=fs.readFileSync('/workspace/qc-site/axe.min.js','utf8');
const BASE=process.argv[2]||'http://127.0.0.1:8796/'; const OUT=process.argv[3]||'/tmp/sfqa'; fs.mkdirSync(OUT,{recursive:true});
const TAGS=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];
const ACT={0:['pay'],1:['adv','adv'],2:['code'],3:[],4:['photo','photo2'],5:['xfer'],6:['offer']};
const NAMES=['1-order-pay','2-queue','3-pickup-code','4-inventory','5-foto-y-listo','6-below-par-transfer','7-weekly-offers'];
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--autoplay-policy=no-user-gesture-required']});let total=0;const res={axe:{},errors:[]};
for(const [vp,w,h,m] of [['desktop',1440,900,false],['phone',390,844,true]]){
 const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m,deviceScaleFactor:m?2:1});const pg=await ctx.newPage();
 pg.on('console',x=>{if(x.type()==='error')res.errors.push(vp+' console: '+x.text())}); pg.on('pageerror',e=>res.errors.push(vp+' pageerror: '+e.message));
 await pg.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>console.error('CSP '+e.violatedDirective+' '+e.blockedURI)));
 const axe=async(name)=>{ if(!(await pg.evaluate(()=>!!window.axe))) await pg.evaluate(AXE);
   const r=await pg.evaluate(async(T)=>(await axe.run(document,{runOnly:{type:'tag',values:T}})).violations.map(v=>({id:v.id,n:v.nodes.length,t:v.nodes.slice(0,3).map(x=>x.target.join(' '))})),TAGS);
   const n=r.reduce((a,v)=>a+v.n,0); total+=n; res.axe[vp+' '+name]=r; console.log(vp,name,'axe',n,n?JSON.stringify(r):''); };
 const shot=async(name,el)=>{ const L=pg.locator(el||'#panel-storefront'); await L.scrollIntoViewIfNeeded(); await pg.waitForTimeout(600); await L.screenshot({path:`${OUT}/${vp}-${name}.png`}); };
 await pg.goto(BASE+'demo.html#storefront',{waitUntil:'load'}); await pg.addStyleTag({content:'#top{visibility:hidden!important}'}); await pg.waitForTimeout(1200);
 for(const lang of ['es','en']){
  await pg.click(`[data-lang=${lang}]`);
  for(let i=0;i<7;i++){ await pg.click(`.sf-step[data-i="${i}"]`); await pg.waitForTimeout(500);
    if(lang==='es'&&i===0) { await shot('storefront-'+lang+'-'+NAMES[i]+'-before'); await axe('sf '+lang+' step'+(i+1)+' before'); }
    for(const a of ACT[i]){ await pg.click(`#sf-root [data-act=${a}]`); await pg.waitForTimeout(450); }
    await shot('storefront-'+lang+'-'+NAMES[i]); await axe('sf '+lang+' step'+(i+1)); }
 }
 // wrong code path
 await pg.click('.sf-step[data-i="2"]'); await pg.fill('#sf-code-in','1234'); await pg.click('#sf-root [data-act=code]'); await axe('sf wrong code');
 // details table
 await pg.evaluate(()=>document.querySelector('.sf-how').open=true); await shot('storefront-component-table','.sf-how'); await axe('sf table');
 // Shuttle tab
 await pg.click('#tab-shuttle'); await pg.waitForTimeout(7000); await shot('shuttle-board','#panel-shuttle'); await axe('shuttle');
 await pg.click('#sh-pause'); await pg.waitForTimeout(300); const paused=await pg.evaluate(()=>document.getElementById('sh-board').contentWindow.__board.paused); console.log(vp,'shuttle pause works',paused);
 await pg.click('.sh-sw[aria-pressed=false]'); await pg.waitForTimeout(7000); await shot('shuttle-flight-board','#panel-shuttle'); await axe('shuttle flight board');
 // Lobby tab (Code column fix in the embedded player)
 await pg.click('#tab-lobby'); await pg.waitForTimeout(6000); await pg.evaluate(()=>{const g=document.querySelector('.acc-gps'); if(g) g.click();}); await pg.waitForTimeout(2500); await shot('lobby-code-column','#acc-root');
 await ctx.close();
 // Board page, flight board screen
 const c2=await b.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m,deviceScaleFactor:m?2:1});const p2=await c2.newPage();
 p2.on('console',x=>{if(x.type()==='error')res.errors.push(vp+' board console: '+x.text())});
 await p2.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>console.error('CSP '+e.violatedDirective+' '+e.blockedURI)));
 await p2.goto(BASE+'board.html?property=demo-hotel&screen=lobby-2&skin=espresso',{waitUntil:'load'}); await p2.waitForTimeout(5000);
 await p2.screenshot({path:`${OUT}/${vp}-board-code-column.png`});
 const hdr=await p2.evaluate(()=>[...document.querySelectorAll('.row-h .c')].map(e=>({t:e.textContent.trim(),clip:e.scrollWidth>e.clientWidth+1})));
 console.log(vp,'board headers',JSON.stringify(hdr)); res['headers '+vp]=hdr; await c2.close();
}
console.log('TOTAL axe',total,'ERRORS',res.errors.length,JSON.stringify(res.errors)); fs.writeFileSync(OUT+'/qa.json',JSON.stringify(res,null,1)); await b.close();})();
