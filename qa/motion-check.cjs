// Reduced motion, pause control (WCAG 2.2.2) and flash-rate check (WCAG 2.3.1).
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
const base=process.argv[2]||'http://127.0.0.1:8796'; const out=process.argv[3]||'/tmp';
const count=()=>{const a=document.getAnimations();const run=a.filter(x=>x.playState==='running');
 const op=run.filter(x=>{try{return x.effect.getKeyframes().some(k=>k.opacity!==undefined)}catch{return false}});
 const rate=Math.max(0,...op.map(x=>{const t=x.effect.getTiming();const d=typeof t.duration==='number'?t.duration:0;return d?1000/d:0}));
 return {running:run.length,maxOpacityCyclesPerSec:+rate.toFixed(2),vanMoving:!!document.querySelector('.m-van')};};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const rm of ['no-preference','reduce']){const ctx=await b.newContext({viewport:{width:1440,height:900},reducedMotion:rm});const pg=await ctx.newPage();
 await pg.goto(base+'/demo.html#lobby');await pg.waitForSelector('.scr-name');await pg.waitForTimeout(5000);
 const vanA=await pg.evaluate(()=>document.querySelector('.m-van')?.getAttribute('transform'));await pg.waitForTimeout(1500);const vanB=await pg.evaluate(()=>document.querySelector('.m-van')?.getAttribute('transform'));
 const s1=await pg.evaluate(count);
 await pg.click('.acc-gps');await pg.waitForTimeout(2500);const s2=await pg.evaluate(count);
 await pg.click('.acc-pause');await pg.waitForTimeout(1500);const s3=await pg.evaluate(count);
 const tA=await pg.evaluate(()=>getComputedStyle(document.querySelector('.tick-track')).transform);await pg.waitForTimeout(1500);const tB=await pg.evaluate(()=>getComputedStyle(document.querySelector('.tick-track')).transform);
 if(rm==='reduce') await (await pg.$('#acc-root')).screenshot({path:out+'/reduced-motion-board-desktop.png'});
 console.log(JSON.stringify({prefersReducedMotion:rm,gpsMap:{...s1,vanStepped:vanA!==vanB},board:s2,paused:{...s3,tickerMovedWhilePaused:tA!==tB}}));await ctx.close();}
await b.close();})();
