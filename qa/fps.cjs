// Frame-rate check: rAF frame intervals over 12 s per state; desktop and phone (4x CPU throttle).
// "Dropped" = intervals > 1.5x the median vsync interval. Also counts Chrome long tasks (>50 ms).
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
const base=process.argv[2]||'http://127.0.0.1:8796';
const STATES=[['lobby-gps-on (van gliding)',''],['lobby-board (rows, flaps)',"document.querySelector('.acc-gps').click()"],['restaurant (ad crossfade + Ken Burns)',"document.querySelector('[data-scene-btn=restaurant]').click()"],['takeover (ring countdown)',"new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('.take.on')){clearInterval(t);r()}},200)})"]];
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--disable-gpu-vsync=false']});const res=[];
for(const [dev,opt,thr] of [['desktop',{viewport:{width:1440,height:900}},1],['phone',{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true},4]]){
 for(const [name,ev] of STATES){const ctx=await b.newContext(opt);const pg=await ctx.newPage();const cdp=await ctx.newCDPSession(pg);
  if(thr>1) await cdp.send('Emulation.setCPUThrottlingRate',{rate:thr});
  await pg.goto(base+'/demo.html#lobby');await pg.waitForSelector('.scr-name');await pg.waitForTimeout(3000);
  if(ev){await pg.evaluate(ev);} await pg.evaluate(()=>document.querySelector('#acc-root').scrollIntoView()); await pg.waitForTimeout(1500);
  const r=await pg.evaluate(()=>new Promise(done=>{const d=[];let last=performance.now();const t0=last;let lt=0;try{new PerformanceObserver(l=>{lt+=l.getEntries().length}).observe({type:'longtask'})}catch{}
   const f=(t)=>{d.push(t-last);last=t;if(t-t0<12000)requestAnimationFrame(f);else{d.shift();const s=[...d].sort((a,b)=>a-b);const med=s[s.length>>1];const dur=d.reduce((a,b)=>a+b,0);
    done({fps:+(d.length/(dur/1000)).toFixed(1),medianMs:+med.toFixed(2),p95Ms:+s[Math.floor(s.length*.95)].toFixed(1),dropped:d.filter(x=>x>med*1.5).length,frames:d.length,longTasks:lt})}};requestAnimationFrame(f)}));
  res.push({dev,cpu:thr+'x',state:name,...r});console.log(JSON.stringify(res.at(-1)));await ctx.close();}}
await b.close();})();
