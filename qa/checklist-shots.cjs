// Screenshots for every lobby checklist item, each skin, the phone split view and the kiosk boards.
// Usage: node qa/checklist-shots.cjs <siteBase> <outDir> <desktop|phone>
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
const [base,out,dev]=process.argv.slice(2); const mob=dev==='phone';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const ctx=await b.newContext(mob?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
const W=(ms)=>pg.waitForTimeout(ms); const click=async(sel)=>{await pg.click(sel);await W(1500)};
const snap=async(name,sel='#acc-root')=>{const el=await pg.$(sel); await el.scrollIntoViewIfNeeded(); await W(300); await el.screenshot({path:`${out}/${name}-${dev}.png`}); console.log('shot',name);};
await pg.goto(base+'/demo.html#lobby'); await pg.waitForSelector('.scr-name'); await W(6000);
await snap('item01-lobby-room-view');
await click('[data-view-btn="screen"]'); await W(400); await snap('item01-zoom-midway'); await W(1200); await snap('item01-screen-only');
await snap('item02-header','.scr-head');
await snap('item09-shuttle-countdown-banner');
await click('.acc-gps'); await W(2500); await snap('item03-departures-arrivals');
await snap('item04-status-badges','.boards');
await snap('item05-07-weather-notice-live-tag','.bn-wx');
await snap('item07-weather-notice-banner','.banners');
if(await pg.$('.acc-demo:not([hidden])')){await click('.acc-demo'); await W(1500); await snap('item10-faa-banner-demo-toggle'); await click('.acc-demo');} else {await snap('item10-faa-banner-live');}
for(const s of ['graphite','steel','espresso','caramel']){await click(`[data-skin-btn="${s}"]`); await snap(`item08-skin-${s}`);}
await click('[data-skin-btn="steel"]');
// gate change: wait until a visible row shows "Gate changed from"
let g=false; for(let i=0;i<40&&!g;i++){g=!!(await pg.$('.gate-note')); if(!g) await W(3000);} 
if(g){await W(600); await snap('item06-gate-change-flash','.boards');} else console.log('no gate change seen');
await click('[data-scene-btn="restaurant"]'); await W(3000); await snap('restaurant-board');
await click('[data-scene-btn="lobby"]'); await click('.acc-gps');
await click('[data-view-btn="split"]'); await W(1000); await snap('item11-split-phone-start','.acc-stage');
// wait for the shuttle takeover (replay) so the phone shows the shuttle alert
await pg.waitForSelector('.take.on',{timeout:150000}).catch(()=>console.log('no takeover'));
await W(4000); await snap('item11-split-phone-shuttle-alert','.acc-stage'); await snap('item09-takeover');
for(const [n,u] of [['kiosk-board-lobby-1-map','board.html?property=demo-hotel&screen=lobby-1'],['kiosk-board-lobby-2-espresso','board.html?property=demo-hotel&screen=lobby-2&skin=espresso'],['kiosk-board-cafe-caramel','board.html?property=demo-cafe&screen=gate-b-1&skin=caramel']]){await pg.goto(base+'/'+u);await W(6000);await pg.screenshot({path:`${out}/${n}-${dev}.png`});console.log('shot',n);}
console.log('errors',JSON.stringify(errs)); await b.close();})();
