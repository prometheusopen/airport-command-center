const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const pg=await b.newPage({viewport:{width:1440,height:1000}});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto(process.argv[2]||'http://127.0.0.1:8795/');await pg.waitForTimeout(+process.argv[4]||4000);
if(process.argv[5]) await pg.evaluate(process.argv[5]); await pg.waitForTimeout(1500);
await pg.screenshot({path:process.argv[3]||'/tmp/local.png',fullPage:true});console.log('errors',JSON.stringify(errs));await b.close();})();
