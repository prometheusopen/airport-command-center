// MP4 recordings via Playwright video (webm) -> ffmpeg H.264. Usage: node qa/record.cjs <base> <outDir>
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');const {execSync}=require('child_process');const fs=require('fs');
const [base,out]=process.argv.slice(2);
const CLIPS=[
 ['lobby-reaching-takeover',async(pg)=>{await pg.waitForTimeout(2000);await pg.click('[data-view-btn="screen"]');await pg.waitForSelector('.take.on',{timeout:150000});await pg.waitForTimeout(12000);},'#acc-root'],
 ['lobby-board-skins-faa-split',async(pg)=>{await pg.click('[data-view-btn="screen"]');await pg.click('.acc-gps');await pg.waitForTimeout(9000);for(const s of ['graphite','espresso','caramel','steel']){await pg.click(`[data-skin-btn="${s}"]`);await pg.waitForTimeout(3000);} if(await pg.$('.acc-demo:not([hidden])')){await pg.click('.acc-demo');await pg.waitForTimeout(5000);await pg.click('.acc-demo');} await pg.click('[data-view-btn="room"]');await pg.waitForTimeout(3000);await pg.click('[data-view-btn="screen"]');await pg.waitForTimeout(3000);await pg.click('.acc-gps');await pg.click('[data-view-btn="split"]');await pg.waitForTimeout(8000);}],
 ['restaurant',async(pg)=>{await pg.click('[data-scene-btn="restaurant"]');await pg.click('[data-view-btn="screen"]');await pg.waitForTimeout(36000);}],
 ['other-tabs',async(pg)=>{for(const t of ['energy','inventory','shuttle','count','lobby']){await pg.click('#tab-'+t);await pg.waitForTimeout(t==='lobby'?6000:4000);}},null,'demo.html'],
];
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const [name,fn,sel,page] of CLIPS){const dir=`/tmp/rec-${name}`;fs.rmSync(dir,{recursive:true,force:true});
 const ctx=await b.newContext({viewport:{width:1280,height:800},recordVideo:{dir,size:{width:1280,height:800}}});const pg=await ctx.newPage();
 await pg.goto(base+'/'+(page||'demo.html#lobby'));await pg.waitForTimeout(2500); if(sel) await pg.evaluate((s)=>{const e=document.querySelector(s);window.scrollTo(0,e.getBoundingClientRect().top+scrollY-70)},sel);
 await fn(pg);const v=await pg.video().path();await ctx.close();
 execSync(`ffmpeg -y -loglevel error -i ${v} -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -r 30 -movflags +faststart ${out}/${name}.mp4`);
 console.log(name,(fs.statSync(`${out}/${name}.mp4`).size/1e6).toFixed(2)+' MB');}
await b.close();})();
