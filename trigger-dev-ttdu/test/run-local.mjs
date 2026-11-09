// Runs src/run.ts (the code inside the Trigger.dev task) against the local runner and compares sha256 with the references.
// usage: node test/run-local.mjs <port> <keyfile>   (bundled with esbuild first)
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const [port, keyFile, outDir] = process.argv.slice(2);
const { runTtdu } = await import(new URL('./run.bundle.cjs', import.meta.url));
const env = { TTDU_TARGET: 'local', TTDU_URL: 'http://127.0.0.1:' + port, TTDU_API_KEY: fs.readFileSync(keyFile, 'utf8').trim() };
const DM = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/'); const T = (process.env.TTDU_SAMPLES_DIR || './samples').replace(/\/?$/, '/');
const b = (p) => ({ name: path.basename(p), base64: fs.readFileSync(p).toString('base64') });
const REF = { '가나다상회_20261106.pdf': 'ABDEA6092F84', '가상고객사_급여검수_20261106.xlsx': 'AA176C11C9E4', 'client-form-redacted-clean.pdf': '5C9C153044F6', 'client-scan-redacted-clean.png': '8B148CBB5BC0', 'document.pdf': '8E3D32992CC2' };
const cases = { A: { flow: 'A', files: fs.readdirSync(DM + 'A-receipts/input').map((n) => b(DM + 'A-receipts/input/' + n)), vars: { client: '가나다상회', date: '20261106' } }, B: { flow: 'B', files: [b(DM + 'B-payroll/input/2026-10_급여대장(회사).xlsx')], vars: { client: '가상고객사', date: '20261106' } }, C: { flow: 'C', files: [b(DM + 'C-redact/input/client-form.pdf'), b(DM + 'C-redact/input/client-scan.png')] }, HWP: { flow: 'HWP', files: [b(T + 'pilot/h-001.hwpx')] } };
const rows = ['platform\tcase\tfile\tbytes\tsha256\treference\tmatch'];
fs.mkdirSync(outDir, { recursive: true });
for (const [k, p] of Object.entries(cases)) { const r = await runTtdu(p, env); for (const f of r.files) { const buf = Buffer.from(f.base64, 'base64'); fs.writeFileSync(path.join(outDir, k + '_' + f.name), buf); const h = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(); rows.push(['trigger.dev task fn', k, f.name, buf.length, h, REF[f.name], h.startsWith(REF[f.name]) ? 'SAME' : 'DIFF'].join('\t')); } }
fs.writeFileSync(path.join(outDir, 'hashes.tsv'), rows.join('\n') + '\n'); console.log(rows.join('\n'));
