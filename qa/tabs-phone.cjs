// Phone widths: every demo tab visible (no hidden horizontal scroll), plus Photo count opens with the sample shelf.
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');const fs=require('fs');
const BASE=process.argv[2]||'http://127.0.0.1:8796/'; const OUT=process.argv[3]||'/tmp/tabs'; fs.mkdirSync(OUT,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const [w,h] of [[390,844],[412,915],[1440,900]]){ const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<800,hasTouch:w<800,deviceScaleFactor:w<800?2:1});const pg=await ctx.newPage();
 const errs=[]; pg.on('console',x=>{if(x.type()==='error')errs.push(x.text())});
 await pg.goto(BASE+'demo.html',{waitUntil:'load'}); await pg.waitForTimeout(1000);
 const r=await pg.evaluate(()=>{const t=document.querySelector('.dtabs'),R=t.getBoundingClientRect();return {scroll:t.scrollWidth>t.clientWidth+1,vw:innerWidth,tabs:[...document.querySelectorAll('.dtab')].map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent,inView:r.left>=0&&r.right<=innerWidth+0.5&&r.right<=R.right+0.5}})}});
 console.log(w,'hiddenScroll',r.scroll,'allVisible',r.tabs.every(x=>x.inView),JSON.stringify(r.tabs.filter(x=>!x.inView)));
 await pg.locator('.dtabs').screenshot({path:`${OUT}/tabs-${w}.png`}); await pg.screenshot({path:`${OUT}/tabs-${w}-page.png`});
 await pg.goto('about:blank'); await pg.goto(BASE+'demo.html#count',{waitUntil:'load'}); await pg.waitForFunction(()=>document.querySelectorAll('#pc-lines > *').length>0,null,{timeout:15000}).catch(()=>{});
 const c=await pg.evaluate(()=>({sel:document.querySelector('#tab-count').getAttribute('aria-selected'),lines:document.querySelectorAll('#pc-lines > *').length,img:!!document.querySelector('#pc-frame canvas,#pc-frame img'),status:document.querySelector('#pc-status').textContent}));
 console.log(w,'#count load',JSON.stringify(c)); await pg.locator('#panel-count').screenshot({path:`${OUT}/count-hash-${w}.png`});
 await pg.goto(BASE+'demo.html',{waitUntil:'load'}); await pg.waitForTimeout(800); await pg.click('#tab-count'); await pg.waitForTimeout(2000);
 const c2=await pg.evaluate(()=>document.querySelectorAll('#pc-lines > *').length); console.log(w,'count via tab click lines',c2);
 await pg.locator('#panel-count').screenshot({path:`${OUT}/count-tab-${w}.png`}); console.log(w,'errors',JSON.stringify(errs)); await ctx.close(); }
await b.close();})();
