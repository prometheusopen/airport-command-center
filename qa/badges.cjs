// Renders every status badge in every skin with the real player CSS and checks WCAG contrast.
const {chromium}=require('/workspace/qa-tools/node_modules/playwright-core'); const fs=require('fs');
const [css,out]=process.argv.slice(2);
const chips=[['ok','✓','On time'],['early','◀','Early 10m'],['sched','○','Scheduled'],['board','●','Boarding'],['final','◆','Final call'],['delay','▲','Delayed 25m'],['landed','↓','Landed'],['cancel','✕','Cancelled']];
const skins=['graphite','steel','espresso','caramel'];
const html=`<!doctype html><html><head><style>${fs.readFileSync(css,'utf8')}</style><style>body{margin:0;background:#000}.scr{position:relative;height:auto;display:block;padding:24px 40px}.lbl{font:700 24px Inter,sans-serif;color:var(--ink);margin:6px 0 12px}.chips{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px}</style></head><body class="acc">
${skins.map(s=>`<div class="scr" data-skin="${s}"><p class="lbl">Skin: ${s}</p><div class="chips">${chips.map(([c,i,t])=>`<span class="chip chip-${c}"><i>${i}</i>${t}</span>`).join('')}</div></div>`).join('')}</body></html>`;
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const pg=await b.newPage({viewport:{width:1920,height:900}});
await pg.setContent(html); await pg.addScriptTag({path:'/workspace/qa-tools/node_modules/axe-core/axe.min.js'}).catch(()=>{});
const res=await pg.evaluate(()=>{const L=(c)=>{const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
 return [...document.querySelectorAll('.chip')].map(e=>{const cs=getComputedStyle(e);const a=L(cs.color),b=L(cs.backgroundColor);return {skin:e.closest('.scr').dataset.skin,chip:e.textContent,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)}})});
const axe=await pg.evaluate(async()=>window.axe?(await axe.run(document,{runOnly:['color-contrast']})).violations.length:'axe n/a');
await pg.screenshot({path:out,fullPage:true}); console.log(JSON.stringify({min:Math.min(...res.map(r=>r.ratio)),fails:res.filter(r=>r.ratio<4.5),axeContrastViolations:axe,all:res}));await b.close();})();
