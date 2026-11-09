// P7 E2E (2026-11-10): ERPNext v16.54.0 (Docker on this PC, minimal bench) — attach results to a Customer.
// usage: node e2e-erpnext.mjs --config <connectors.json with erpnext (+ erpnext_badkey)> --out <report.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CFG = path.resolve(flag('--config')); const OUT = path.resolve(flag('--out', 'e2e-erpnext.json'));
const DEMO = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
const WORK = path.resolve((process.env.TTDU_WORK || '.ttdu-work') + '/erp-' + Date.now()); fs.mkdirSync(path.join(WORK, 'flows'), { recursive: true });
process.env.TTDU_KEY_FILE = path.join(WORK, 'local-api-key.txt'); process.env.TTDU_FLOWS = path.join(WORK, 'flows'); process.env.TTDU_CONNECTORS = CFG;
if (!process.env.TTDU_SITE) { const S = (process.env.TTDU_STAGING_DIR || 'staging').replace(/\/?$/, '/'); const d = fs.readdirSync(S).filter((n) => /^live-\d+$/.test(n) && fs.existsSync(S + n + '/module-runners')).sort(); process.env.TTDU_SITE = S + d[d.length - 1]; }
const { loadConnectors } = await import('../src/config.mjs');
const { deliver, checkAll } = await import('../src/deliver.mjs');
const { request } = await import('../src/net.mjs');
const cfg = loadConnectors(CFG); const E = cfg.connectors.erpnext;
const H = { authorization: 'token ' + E.secret, 'x-frappe-site-name': E.site || '' };
const get = async (p) => (await request(E, { path: p, headers: H }));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rows = []; const t = (name, pass, info) => { rows.push({ name, pass: !!pass, info: info === undefined ? null : info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const pdfC = fs.readFileSync(DEMO + 'C-redact/output-cli/client-form-redacted-clean.pdf');
const xlsx = fs.readFileSync(DEMO + 'B-payroll/output-cli/가상고객사_급여검수_20261106.xlsx');

const chk = await checkAll(cfg);
t('E1 check: key ok, bad key fails', chk.find((c) => c.id === 'erpnext').ok && (!cfg.connectors.erpnext_badkey || (chk.find((c) => c.id === 'erpnext_badkey').ok === false && chk.find((c) => c.id === 'erpnext_badkey').code === 'auth_failed')), chk.map((c) => [c.id, c.ok, c.user || c.code, c.server_version || null]));
let rec = await deliver({ outputs: [{ name: '가나다상회_가림본.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'erpnext', doctype: 'Customer', comment: 'TTDU 가림 처리 결과: {file}' }], vars: { client: '가나다상회' }, config: cfg });
const e2 = rec[0];
t('E2 stored on Customer (private file) + timeline comment', e2.ok && e2.status === 'stored' && e2.id && e2.record_id === '가나다상회' && e2.comment === true && /^\/private\/files\//.test(e2.file_url || ''), e2);
if (e2.id) {
  const f = (await get(`api/resource/File/${encodeURIComponent(e2.id)}`)).json().data;
  const dl = await get(f.file_url.replace(/^\//, ''));
  t('E2 File doc linked to the Customer and stored bytes = our file', f.attached_to_doctype === 'Customer' && f.attached_to_name === '가나다상회' && f.is_private === 1 && dl.status === 200 && sha(dl.body) === sha(pdfC), { attached_to: f.attached_to_doctype + '/' + f.attached_to_name, is_private: f.is_private, content_hash: f.content_hash, size: dl.body.length });
}
rec = await deliver({ outputs: [{ name: '가나다상회_가림본.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'erpnext' }], vars: { client: '가나다상회' }, config: cfg });
t('E3 same file again -> duplicate (content_hash md5)', rec[0].ok && rec[0].status === 'duplicate' && rec[0].id === e2.id, rec[0]);
rec = await deliver({ outputs: [{ name: 'x.pdf', bytes: new Uint8Array(pdfC) }], rules: [{ to: 'erpnext', find: { customer_name: '없는상회' } }], vars: {}, config: cfg });
t('E4 no such customer -> not_found', !rec[0].ok && rec[0].code === 'not_found', rec[0]);
// E5 through the runner: B flow (xlsx) + deliver to ERPNext
const { startServe } = await import(pathToFileURL((process.env.TTDU_PLATFORM || '../ttdu-platform').replace(/\/?$/, '/') + 'apps/office-runner/serve.mjs').href);
const srv = await startServe({ port: 0, quiet: true }); const port = new URL(srv.url).port;
const B = JSON.parse(fs.readFileSync(DEMO + '_flows/B-payroll.json', 'utf8'));
const form = new FormData(); form.append('flow', JSON.stringify({ ...B, deliver: [{ to: 'erpnext', doctype: 'Customer', find: { customer_name: '가나다상회' }, file_name: '{client}_급여검수_{date}.xlsx' }] })); form.append('vars', JSON.stringify({ client: '가상고객사', date: '20261110' }));
for (const n of fs.readdirSync(DEMO + 'B-payroll/input')) form.append('files', new Blob([fs.readFileSync(DEMO + 'B-payroll/input/' + n)]), n);
const fr = new Response(form); const body = Buffer.from(await fr.arrayBuffer());
const res = await new Promise((ok, bad) => { const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/flows/run', headers: { 'x-api-key': srv.key, 'content-type': fr.headers.get('content-type'), 'content-length': body.length }, agent: false, timeout: 600000 }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => ok({ s: r.statusCode, j: JSON.parse(Buffer.concat(c).toString('utf8')) })); }); q.on('error', bad); q.write(body); q.end(); });
const d5 = res.j.deliveries && res.j.deliveries[0];
const outB = res.j.outputs && Buffer.from(res.j.outputs[0].base64, 'base64');
t('E5 runner B flow (xlsx = demo bytes) -> attached to the Customer in ERPNext', res.s === 200 && res.j.ok && outB && sha(outB) === sha(xlsx) && d5 && d5.ok && d5.status === 'stored', d5);
await srv.close();
const pass = rows.filter((x) => x.pass).length;
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), erpnext: E.url, version: 'v16.54.0', pass, total: rows.length, rows }, null, 1));
console.log(`${pass}/${rows.length}`); fs.rmSync(WORK, { recursive: true, force: true });
process.exit(pass === rows.length ? 0 : 1);
