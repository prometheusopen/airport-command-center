// Local stand-in for Vercel: serves the static site and runs api/*.mjs handlers. Dev/QA only.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const SITE = path.resolve(process.argv[2] || '/workspace/prometheus-open-flagship'); const PORT = Number(process.argv[3] || 8796);
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.onnx': 'application/octet-stream', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  const fn = p.match(/^\/api\/([a-z-]+)$/);
  if (fn) { const f = path.join(SITE, 'api', fn[1] + '.mjs'); if (fs.existsSync(f)) { const m = await import(f + '?t=' + fs.statSync(f).mtimeMs); return m.default(req, res); } }
  if (p.endsWith('/')) p += 'index.html'; const f = path.normalize(path.join(SITE, p));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /\/api\//.test(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('site dev server http://127.0.0.1:' + PORT));
