// Screenshot of the local Traccar web UI while the replay is moving the device.
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core');const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync(__dirname+'/../.env','utf8').trim().split('\n').map(l=>l.split(/=(.*)/s).slice(0,2)));
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const pg=await b.newPage({viewport:{width:1440,height:900}});
await pg.goto('http://127.0.0.1:8082/');await pg.waitForTimeout(2500);
await pg.fill('input[type=email], input[name=email]',env.TRACCAR_EMAIL);await pg.fill('input[type=password]',env.TRACCAR_PASSWORD);
await pg.keyboard.press('Enter');await pg.waitForTimeout(5000);
const dev=pg.getByText('Shuttle van 1 (demo)').first();if(!process.env.NOSELECT)await dev.click().catch(()=>{});await pg.waitForTimeout(3000); await pg.waitForTimeout(4000);
await pg.screenshot({path:process.argv[2]||'/tmp/traccar.png'});
const t=await pg.evaluate(()=>document.body.innerText.slice(0,600));console.log(t);await b.close();})();
