// P7 E2E (2026-11-09): office runner screen (`ttdu ui`, ui.mjs) runs a flow that has a deliver step.
// usage: node e2e-ui-deliver.mjs --config <connectors.json> --flow <flow with deliver> --in <folder> --out <report.json> [--var k=v] [--keep-open]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(flag('--work', (process.env.TTDU_WORK || '.ttdu-work') + '/ui-' + Date.now()));
fs.mkdirSync(path.join(WORK, 'flows'), { recursive: true });
fs.copyFileSync(path.resolve(flag('--flow')), path.join(WORK, 'flows', path.basename(flag('--flow'))));
process.env.TTDU_FLOWS = path.join(WORK, 'flows');
process.env.TTDU_CONNECTORS = path.resolve(flag('--config'));
if (!process.env.TTDU_SITE) { const S = (process.env.TTDU_STAGING_DIR || 'staging').replace(/\/?$/, '/'); const d = fs.readdirSync(S).filter((n) => /^live-\d+$/.test(n) && fs.existsSync(S + n + '/module-runners')).sort(); process.env.TTDU_SITE = S + d[d.length - 1]; }
const vars = {}; argv.forEach((x, i) => { if (x === '--var') { const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(argv[i + 1] || ''); if (m) vars[m[1]] = m[2]; } });
const { startUi } = await import(pathToFileURL((process.env.TTDU_PLATFORM || '../ttdu-platform').replace(/\/?$/, '/') + 'apps/office-runner/ui.mjs').href);
const ui = await startUi({ port: 0, open: false });
const port = new URL(ui.url).port;
const call = (method, p, body, token) => new Promise((ok, bad) => { const b = body ? Buffer.from(JSON.stringify(body)) : null; const q = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(b ? { 'content-type': 'application/json', 'content-length': b.length } : {}), ...(token ? { 'x-ttdu-token': token } : {}) }, agent: false }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ s: res.statusCode, t: Buffer.concat(c).toString('utf8') })); }); q.on('error', bad); if (b) q.write(b); q.end(); });
const page = await call('GET', '/');
const token = (/[0-9a-f]{32}/.exec(page.t) || [])[0];
const init = JSON.parse((await call('POST', '/api/init', {}, token)).t);
const out = path.join(WORK, 'out');
await call('POST', '/api/run', { flow: 0, in: path.resolve(flag('--in')), out, vars }, token);
let st; for (let i = 0; i < 600; i++) { await new Promise((r) => setTimeout(r, 1000)); st = JSON.parse((await call('POST', '/api/status', {}, token)).t); if (!st.running) break; }
const lines = st.log || [];
const rows = [
  { name: 'UI run finished ok', pass: st.ok === true },
  { name: 'UI log shows 보관 연결 line', pass: lines.some((l) => /^보관 연결/.test(l)) },
  { name: 'UI log shows a 보관 result per output', pass: lines.filter((l) => /^보관 \S+ .+ → (stored|duplicate)/.test(l)).length === fs.readdirSync(out).length },
  { name: 'UI state.deliveries all ok', pass: Array.isArray(st.deliveries) && st.deliveries.length > 0 && st.deliveries.every((d) => d.ok) },
];
for (const r of rows) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name);
console.log(lines.join('\n'));
fs.writeFileSync(path.resolve(flag('--out')), JSON.stringify({ at: new Date().toISOString(), flows: init.flows.map((f) => f.name), log: lines, deliveries: st.deliveries, rows }, null, 1));
if (argv.includes('--keep-open')) { console.log('UI: ' + ui.url + ' (token in page)'); await new Promise((r) => setTimeout(r, Number(flag('--keep-open-ms', '90000')))); }
ui.close(); fs.rmSync(WORK, { recursive: true, force: true });
process.exit(rows.every((r) => r.pass) ? 0 : 1);
