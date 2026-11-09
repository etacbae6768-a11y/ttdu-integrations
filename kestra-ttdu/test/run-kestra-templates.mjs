import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const B = 'http://127.0.0.1:8085/api/v1/main'; const AUTH = 'Basic ' + Buffer.from((process.env.KESTRA_USER + ':' + process.env.KESTRA_PASSWORD)).toString('base64'); const K = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = process.argv[2]; const port = process.argv[3];
const call = async (m, p, body, h = {}) => { const r = await fetch(B + p, { method: m, headers: { Authorization: AUTH, ...h }, body }); const t = await r.text(); if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 300)); try { return JSON.parse(t); } catch { return t; } };
const DM = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
const up = async (rel, file) => { const f = new FormData(); f.append('fileContent', new Blob([fs.readFileSync(file)]), path.basename(rel)); await call('POST', '/namespaces/ttdu.office/files?path=' + encodeURIComponent('/' + rel), f); };
await up('payroll/가상고객사/2026-10_급여대장(회사).xlsx', DM + 'B-payroll/input/2026-10_급여대장(회사).xlsx');
for (const id of ['ttdu-redact-webhook', 'ttdu-monthly-payroll']) { try { await call('DELETE', '/flows/ttdu.office/' + id); } catch {} await call('POST', '/flows', fs.readFileSync(K + 'flows/' + id + '.yml', 'utf8').replaceAll('host.docker.internal:8790', 'host.docker.internal:' + port), { 'Content-Type': 'application/x-yaml' }); }
const wait = async (id) => { for (let i = 0; i < 60; i++) { const e = await call('GET', '/executions/' + id); if (['SUCCESS', 'FAILED', 'KILLED', 'WARNING'].includes(e.state.current)) return e; await new Promise((r) => setTimeout(r, 2000)); } };
const rows = [];
const dl = async (label, e) => { let of = (e.outputs && e.outputs.files) || {}; if (typeof of === 'string') of = JSON.parse(of); if (e.state.current !== 'SUCCESS') rows.push(label + '\t' + e.state.current); for (const [rel, uri] of Object.entries(of)) { const buf = Buffer.from(await (await fetch(B + '/executions/' + e.id + '/file?path=' + encodeURIComponent(uri), { headers: { Authorization: AUTH } })).arrayBuffer()); fs.writeFileSync(path.join(OUT, label + '_' + path.basename(rel)), buf); rows.push([label, path.basename(rel), buf.length, crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(), e.id].join('\t')); } };
const body = { files: ['client-form.pdf', 'client-scan.png'].filter((n) => fs.statSync(DM + 'C-redact/input/' + n).size < 300000).map((n) => ({ name: n, base64: fs.readFileSync(DM + 'C-redact/input/' + n).toString('base64') })) };
const w = await call('POST', '/executions/webhook/ttdu.office/ttdu-redact-webhook/change-this-long-random-key', JSON.stringify(body), { 'Content-Type': 'application/json' });
await dl('webhook-C', await wait(w.id));
const m = await call('POST', '/executions/ttdu.office/ttdu-monthly-payroll', new FormData());
await dl('monthly-B', await wait(m.id));
fs.writeFileSync(path.join(OUT, 'templates-2-3.tsv'), rows.join('\n') + '\n'); console.log(rows.join('\n'));



