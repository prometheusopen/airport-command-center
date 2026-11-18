const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
const [url,out,wait,ev,mob]=process.argv.slice(2);
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const ctx=await b.newContext(mob?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto(url);await pg.waitForTimeout(+wait||5000); if(ev){await pg.evaluate(ev);await pg.waitForTimeout(2000);}
const el=await pg.$('#panel-lobby'); if(el) await el.screenshot({path:out}); else await pg.screenshot({path:out});
console.log('errors',JSON.stringify(errs), await pg.evaluate(()=>window.__accError||''));await b.close();})();
