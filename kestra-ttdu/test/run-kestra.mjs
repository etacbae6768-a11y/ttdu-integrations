// Kestra test: upload namespace file, create flow (test URL), run A/B/C/HWP via the executions API, download outputs, compare sha256.
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const [port, outDir] = process.argv.slice(2);
const B = 'http://127.0.0.1:8085/api/v1/main'; const AUTH = 'Basic ' + Buffer.from((process.env.KESTRA_USER + ':' + process.env.KESTRA_PASSWORD)).toString('base64');
const K = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const call = async (method, p, body, headers = {}) => { const r = await fetch(B + p, { method, headers: { Authorization: AUTH, ...headers }, body }); const t = await r.text(); if (!r.ok) throw new Error(method + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 400)); try { return JSON.parse(t); } catch { return t; } };
const nf = new FormData(); nf.append('fileContent', new Blob([fs.readFileSync(K + 'namespace-files/ttdu_client.py')]), 'ttdu_client.py');
await call('POST', '/namespaces/ttdu.office/files?path=%2Fttdu_client.py', nf);
const yml = fs.readFileSync(K + 'flows/ttdu-run.yml', 'utf8').replaceAll('http://host.docker.internal:8790', 'http://host.docker.internal:' + port);
try { await call('DELETE', '/flows/ttdu.office/ttdu-run'); } catch {}
await call('POST', '/flows', yml, { 'Content-Type': 'application/x-yaml' });
const DM = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/'); const T = (process.env.TTDU_SAMPLES_DIR || './samples').replace(/\/?$/, '/');
const REF = { '가나다상회_20261106.pdf': 'ABDEA6092F84', '가상고객사_급여검수_20261106.xlsx': 'AA176C11C9E4', 'client-form-redacted-clean.pdf': '5C9C153044F6', 'client-scan-redacted-clean.png': '8B148CBB5BC0', 'document.pdf': '8E3D32992CC2' };
const cases = { A: [fs.readdirSync(DM + 'A-receipts/input').map((n) => DM + 'A-receipts/input/' + n), { client: '가나다상회', date: '20261106' }], B: [[DM + 'B-payroll/input/2026-10_급여대장(회사).xlsx'], { client: '가상고객사', date: '20261106' }], C: [[DM + 'C-redact/input/client-form.pdf', DM + 'C-redact/input/client-scan.png'], {}], HWP: [[T + 'pilot/h-001.hwpx'], {}] };
const rows = ['platform\tcase\tfile\tbytes\tsha256\treference\tmatch\texecution'];
fs.mkdirSync(outDir, { recursive: true });
for (const [k, [files, vars]] of Object.entries(cases)) {
  const f = new FormData(); f.append('flow', k); files.forEach((p, i) => f.append('f' + (i + 1), new Blob([fs.readFileSync(p)]), path.basename(p))); for (const [a, b] of Object.entries(vars)) f.append(a, b);
  const ex = await call('POST', '/executions/ttdu.office/ttdu-run?wait=true', f);
  const st = ex.state && ex.state.current; const tr = (ex.taskRunList || []).find((t) => t.taskId === 'run');
  let of = (tr && tr.outputs && tr.outputs.outputFiles) || (ex.outputs && ex.outputs.files) || {}; if (typeof of === 'string') of = JSON.parse(of);
  if (st !== 'SUCCESS') { rows.push(['kestra', k, 'STATE ' + st, '', '', '', 'FAIL', ex.id].join('\t')); continue; }
  for (const [rel, uri] of Object.entries(of)) {
    const r = await fetch(B + '/executions/' + ex.id + '/file?path=' + encodeURIComponent(uri), { headers: { Authorization: AUTH } });
    const buf = Buffer.from(await r.arrayBuffer()); const name = path.basename(rel); fs.writeFileSync(path.join(outDir, k + '_' + name), buf);
    const h = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    rows.push(['kestra', k, name, buf.length, h, REF[name] || '', REF[name] && h.startsWith(REF[name]) ? 'SAME' : 'DIFF', ex.id].join('\t'));
  }
}
fs.writeFileSync(path.join(outDir, 'hashes.tsv'), rows.join('\n') + '\n'); console.log(rows.join('\n'));


