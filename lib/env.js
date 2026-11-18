import fs from 'node:fs';
export function loadEnv(file = new URL('../.env', import.meta.url)) {
  try { for (const line of fs.readFileSync(file, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; } } catch {}
  return process.env;
}
