// P7 E2E (2026-11-10): Twenty v2.56.1 (Docker on this PC) — attach results to a company, direct + through the runner.
// usage: node e2e-twenty.mjs --config <connectors.json with twenty (+ twenty_badkey)> --out <report.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CFG = path.resolve(flag('--config')); const OUT = path.resolve(flag('--out', 'e2e-twenty.json'));
const DEMO = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
const WORK = path.resolve((process.env.TTDU_WORK || '.ttdu-work') + '/twenty-' + Date.now()); fs.mkdirSync(path.join(WORK, 'flows'), { recursive: true });
process.env.TTDU_KEY_FILE = path.join(WORK, 'local-api-key.txt'); process.env.TTDU_FLOWS = path.join(WORK, 'flows'); process.env.TTDU_CONNECTORS = CFG;
if (!process.env.TTDU_SITE) { const S = (process.env.TTDU_STAGING_DIR || 'staging').replace(/\/?$/, '/'); const d = fs.readdirSync(S).filter((n) => /^live-\d+$/.test(n) && fs.existsSync(S + n + '/module-runners')).sort(); process.env.TTDU_SITE = S + d[d.length - 1]; }
const { loadConnectors } = await import('../src/config.mjs');
const { deliver, checkAll } = await import('../src/deliver.mjs');
const { request } = await import('../src/net.mjs');
const cfg = loadConnectors(CFG); const T = cfg.connectors.twenty;
const rest = async (p) => (await request(T, { path: 'rest/' + p, headers: { authorization: 'Bearer ' + T.secret } })).json();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rows = []; const t = (name, pass, info) => { rows.push({ name, pass: !!pass, info: info === undefined ? null : info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info).replace(/token=[^"&]+/g, 'token=***') : '')); };
const pdfA = fs.readFileSync(DEMO + 'A-receipts/output-cli/가나다상회_20261106.pdf');
const pdfC = fs.readFileSync(DEMO + 'C-redact/output-cli/client-form-redacted-clean.pdf');

const chk = await checkAll(cfg);
t('W1 check: key ok (attachment FILES field found), bad key fails', chk.find((c) => c.id === 'twenty').ok && (!cfg.connectors.twenty_badkey || (chk.find((c) => c.id === 'twenty_badkey').ok === false && chk.find((c) => c.id === 'twenty_badkey').code === 'auth_failed')), chk.map((c) => [c.id, c.ok, c.code || c.companies]));
let rec = await deliver({ outputs: [{ name: '가나다상회_가림본.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'twenty', object: 'company', find: { name: '{client}' } }], vars: { client: '가나다상회' }, config: cfg });
const w2 = rec[0];
t('W2 stored as attachment on company', w2.ok && w2.status === 'stored' && w2.id && w2.record_id, w2);
if (w2.id) {
  const a = await rest(`attachments/${w2.id}`); const att = a.data && (a.data.attachment || a.data);
  const f = att && att.file && att.file[0];
  let same = false, size = null;
  if (f && f.url) { const u = new URL(f.url); const d = await request({ url: u.origin }, { path: u.pathname + u.search }); size = d.body.length; same = d.status === 200 && sha(d.body) === sha(pdfC); }
  t('W2 attachment linked to the company and stored bytes = our file', att && att.targetCompanyId === w2.record_id && att.name === '가나다상회_가림본.pdf' && same, { name: att && att.name, targetCompanyId: att && att.targetCompanyId, size });
}
rec = await deliver({ outputs: [{ name: '가나다상회_가림본.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'twenty', find: { name: '{client}' } }], vars: { client: '가나다상회' }, config: cfg });
t('W3 same name on same company -> duplicate', rec[0].ok && rec[0].status === 'duplicate' && rec[0].id === w2.id, rec[0]);
rec = await deliver({ outputs: [{ name: 'x.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'twenty', find: { name: '없는회사' } }], vars: {}, config: cfg });
t('W4 no such company -> not_found', !rec[0].ok && rec[0].code === 'not_found', rec[0]);
// W5 through the runner: A flow + deliver to Twenty
const { startServe } = await import(pathToFileURL((process.env.TTDU_PLATFORM || '../ttdu-platform').replace(/\/?$/, '/') + 'apps/office-runner/serve.mjs').href);
const srv = await startServe({ port: 0, quiet: true }); const port = new URL(srv.url).port;
const A = JSON.parse(fs.readFileSync(DEMO + '_flows/A-receipts.json', 'utf8'));
const form = new FormData(); form.append('flow', JSON.stringify(A)); form.append('vars', JSON.stringify({ client: '가나다상회', date: '20261110' })); form.append('deliver', JSON.stringify([{ to: 'twenty', find: { name: '{client}' }, name: '{client}_{date}_증빙.pdf' }]));
for (const n of fs.readdirSync(DEMO + 'A-receipts/input')) form.append('files', new Blob([fs.readFileSync(DEMO + 'A-receipts/input/' + n)]), n);
const fr = new Response(form); const body = Buffer.from(await fr.arrayBuffer());
const res = await new Promise((ok, bad) => { const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/flows/run', headers: { 'x-api-key': srv.key, 'content-type': fr.headers.get('content-type'), 'content-length': body.length }, agent: false, timeout: 600000 }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => ok({ s: r.statusCode, j: JSON.parse(Buffer.concat(c).toString('utf8')) })); }); q.on('error', bad); q.write(body); q.end(); });
const d5 = res.j.deliveries && res.j.deliveries[0];
const outA = res.j.outputs && Buffer.from(res.j.outputs[0].base64, 'base64');
t('W5 runner A flow (PDF = demo bytes) -> attached to company in Twenty', res.s === 200 && res.j.ok && outA && sha(outA) === sha(pdfA) && d5 && d5.ok && d5.status === 'stored', d5);
await srv.close();
const pass = rows.filter((x) => x.pass).length;
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), twenty: T.url, version: 'v2.56.1', pass, total: rows.length, rows }, null, 1).replace(/token=[^"&]+/g, 'token=***'));
console.log(`${pass}/${rows.length}`); fs.rmSync(WORK, { recursive: true, force: true });
process.exit(pass === rows.length ? 0 : 1);
