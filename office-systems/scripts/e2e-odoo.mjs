// P7 E2E (2026-11-09): Odoo 19 (Docker on this PC) — JSON-2 and legacy JSON-RPC, direct deliver + runner serve.
// usage: node e2e-odoo.mjs --config <connectors.json with odoo (json2), odoo_legacy (jsonrpc), odoo_badkey> --out <report.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CFG = path.resolve(flag('--config')); const OUT = path.resolve(flag('--out', 'e2e-odoo.json'));
const DEMO = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
const WORK = path.resolve((process.env.TTDU_WORK || '.ttdu-work') + '/odoo-' + Date.now()); fs.mkdirSync(path.join(WORK, 'flows'), { recursive: true });
process.env.TTDU_KEY_FILE = path.join(WORK, 'local-api-key.txt'); process.env.TTDU_FLOWS = path.join(WORK, 'flows'); process.env.TTDU_CONNECTORS = CFG;
if (!process.env.TTDU_SITE) { const S = (process.env.TTDU_STAGING_DIR || 'staging').replace(/\/?$/, '/'); const d = fs.readdirSync(S).filter((n) => /^live-\d+$/.test(n) && fs.existsSync(S + n + '/module-runners')).sort(); process.env.TTDU_SITE = S + d[d.length - 1]; }
const { loadConnectors } = await import('../src/config.mjs');
const { deliver, checkAll } = await import('../src/deliver.mjs');
const { request } = await import('../src/net.mjs');
const cfg = loadConnectors(CFG); const O = cfg.connectors.odoo;
const j2 = async (model, method, body) => { const r = await request(O, { method: 'POST', path: `json/2/${model}/${method}`, headers: { authorization: 'bearer ' + O.secret, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rows = []; const t = (name, pass, info) => { rows.push({ name, pass: !!pass, info: info === undefined ? null : info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const xlsx = fs.readFileSync(DEMO + 'B-payroll/output-cli/가상고객사_급여검수_20261106.xlsx');
const pdf = fs.readFileSync(DEMO + 'A-receipts/output-cli/가나다상회_20261106.pdf');

// O1 connection check (both protocols) + wrong key
const chk = await checkAll(cfg);
t('O1 check json2 + jsonrpc ok, bad key fails', chk.find((c) => c.id === 'odoo').ok && chk.find((c) => c.id === 'odoo_legacy').ok && chk.find((c) => c.id === 'odoo_badkey').ok === false && chk.find((c) => c.id === 'odoo_badkey').code === 'auth_failed', chk.map((c) => [c.id, c.ok, c.server_version || c.code]));
// O2 attach the payroll check xlsx to 거래처 가나다상회 (json2) + chatter note
let rec = await deliver({ outputs: [{ name: '가나다상회_급여검수_20261106.xlsx', bytes: new Uint8Array(xlsx) }], rules: [{ to: 'odoo', model: 'res.partner', find: { name: '{client}' }, note: 'TTDU 급여 검수 결과: {file}' }], vars: { client: '가나다상회' }, config: cfg });
const a2 = rec[0];
t('O2 json2 stored on res.partner with note', a2.ok && a2.status === 'stored' && a2.id > 0 && a2.note === true, a2);
if (a2.id) {
  const att = (await j2('ir.attachment', 'read', { ids: [a2.id], fields: ['name', 'res_model', 'res_id', 'datas', 'mimetype'] }))[0];
  t('O2 attachment bytes/name/record match', att && sha(Buffer.from(att.datas, 'base64')) === sha(xlsx) && att.res_model === 'res.partner' && att.res_id === a2.record_id && att.name === '가나다상회_급여검수_20261106.xlsx', att && { name: att.name, res_model: att.res_model, res_id: att.res_id, mimetype: att.mimetype });
  const msgs = await j2('mail.message', 'search_read', { domain: [['model', '=', 'res.partner'], ['res_id', '=', a2.record_id], ['attachment_ids', 'in', [a2.id]]], fields: ['body', 'message_type'], limit: 1 });
  t('O2 chatter note carries the attachment', msgs.length === 1 && /TTDU 급여 검수 결과/.test(msgs[0].body), msgs[0]);
}
// O3 same file again -> duplicate
rec = await deliver({ outputs: [{ name: '가나다상회_급여검수_20261106.xlsx', bytes: new Uint8Array(xlsx) }], rules: [{ to: 'odoo', model: 'res.partner', find: { name: '{client}' } }], vars: { client: '가나다상회' }, config: cfg });
t('O3 rerun -> duplicate (same attachment id)', rec[0].ok && rec[0].status === 'duplicate' && rec[0].id === a2.id, rec[0]);
// O4 legacy jsonrpc -> employee record
rec = await deliver({ outputs: [{ name: '홍길동_급여검수.pdf', bytes: new Uint8Array(pdf) }], rules: [{ to: 'odoo_legacy', model: 'hr.employee', find: { name: '{employee}' }, note: '급여 검수본 첨부' }], vars: { employee: '홍길동' }, config: cfg });
t('O4 jsonrpc stored on hr.employee with note', rec[0].ok && rec[0].status === 'stored' && rec[0].note === true, rec[0]);
// O5 not found / ambiguous / create_missing
rec = await deliver({ outputs: [{ name: 'x.pdf', bytes: new Uint8Array(pdf) }], rules: [{ to: 'odoo', find: { name: '없는상회' } }], vars: {}, config: cfg });
t('O5 no such partner -> not_found (nothing created)', !rec[0].ok && rec[0].code === 'not_found', rec[0]);
await j2('res.partner', 'create', { vals_list: [{ name: '중복상회' }, { name: '중복상회' }] });
rec = await deliver({ outputs: [{ name: 'x.pdf', bytes: new Uint8Array(pdf) }], rules: [{ to: 'odoo', find: { name: '중복상회' } }], vars: {}, config: cfg });
t('O5 two partners with the name -> ambiguous', !rec[0].ok && rec[0].code === 'ambiguous', rec[0]);
rec = await deliver({ outputs: [{ name: '새상회_증빙.pdf', bytes: new Uint8Array(pdf) }], rules: [{ to: 'odoo', find: { name: '새상회' }, create_missing: true }], vars: {}, config: cfg });
t('O5 create_missing:true makes the partner then attaches', rec[0].ok && rec[0].status === 'stored' && rec[0].record_id > 0, rec[0]);
// O6 through the runner: B flow + deliver to Odoo
const { startServe } = await import(pathToFileURL((process.env.TTDU_PLATFORM || '../ttdu-platform').replace(/\/?$/, '/') + 'apps/office-runner/serve.mjs').href);
const srv = await startServe({ port: 0, quiet: true }); const port = new URL(srv.url).port;
const B = JSON.parse(fs.readFileSync(DEMO + '_flows/B-payroll.json', 'utf8'));
const form = new FormData(); form.append('flow', JSON.stringify({ ...B, deliver: [{ to: 'odoo', model: 'res.partner', find: { name: '{client}' }, note: 'TTDU 급여 검수({date})' }] })); form.append('vars', JSON.stringify({ client: '가나다상회', date: '20261109' }));
for (const n of fs.readdirSync(DEMO + 'B-payroll/input')) form.append('files', new Blob([fs.readFileSync(DEMO + 'B-payroll/input/' + n)]), n);
const fr = new Response(form); const body = Buffer.from(await fr.arrayBuffer());
const res = await new Promise((ok, bad) => { const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/flows/run', headers: { 'x-api-key': srv.key, 'content-type': fr.headers.get('content-type'), 'content-length': body.length }, agent: false }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => ok({ s: r.statusCode, j: JSON.parse(Buffer.concat(c).toString('utf8')) })); }); q.on('error', bad); q.write(body); q.end(); });
const d6 = res.j.deliveries && res.j.deliveries[0];
t('O6 runner B flow -> xlsx attached to 거래처 in Odoo', res.s === 200 && res.j.ok && d6 && d6.ok && (d6.status === 'stored' || d6.status === 'duplicate'), d6);
await srv.close();
const pass = rows.filter((x) => x.pass).length;
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), odoo: O.url, pass, total: rows.length, rows }, null, 1));
console.log(`${pass}/${rows.length}`); fs.rmSync(WORK, { recursive: true, force: true });
process.exit(pass === rows.length ? 0 : 1);
