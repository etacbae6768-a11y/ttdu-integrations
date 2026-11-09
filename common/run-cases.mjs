// POST samples to a platform's HTTP endpoints, decode returned files, compare sha256 with the Activepieces references.
// usage: node run-cases.mjs <baseUrl with {p} for preset path> <out dir> <label> [fileField=files] [mode=b64|url]
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const [tpl, outDir, label, field = 'files'] = process.argv.slice(2);
const DM = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
const T = (process.env.TTDU_SAMPLES_DIR || './samples').replace(/\/?$/, '/');
const REF = { '가나다상회_20261106.pdf': 'ABDEA6092F84', '가상고객사_급여검수_20261106.xlsx': 'AA176C11C9E4', 'client-form-redacted-clean.pdf': '5C9C153044F6', 'client-scan-redacted-clean.png': '8B148CBB5BC0', 'document.pdf': '8E3D32992CC2', 'h-001.pdf': '8E3D32992CC2' };
const cases = {
  a: { files: fs.readdirSync(DM + 'A-receipts/input').map((n) => DM + 'A-receipts/input/' + n), vars: { client: '가나다상회', date: '20261106' } },
  b: { files: [DM + 'B-payroll/input/2026-10_급여대장(회사).xlsx'], vars: { client: '가상고객사', date: '20261106' } },
  c: { files: [DM + 'C-redact/input/client-form.pdf', DM + 'C-redact/input/client-scan.png'], vars: {} },
  hwp: { files: [T + 'pilot/h-001.hwpx'], vars: {} },
};
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
for (const [p, c] of Object.entries(cases)) {
  const form = new FormData();
  c.files.forEach((f, i) => form.append(field === 'indexed' ? 'f' + i : field, new Blob([fs.readFileSync(f)]), path.basename(f)));
  for (const [k, v] of Object.entries(c.vars)) form.append(k, v);
  const t0 = Date.now();
  const res = await fetch(tpl.replace('{p}', p), { method: 'POST', body: form });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { rows.push(`${label}\t${p}\tHTTP ${res.status}\t${txt.slice(0, 200)}\t\t\tFAIL`); continue; }
  for (const o of j.files || []) {
    const buf = o.base64 ? Buffer.from(o.base64, 'base64') : Buffer.from(await (await fetch(o.url)).arrayBuffer());
    fs.writeFileSync(path.join(outDir, p + '_' + o.name), buf);
    const h = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(); const ref = REF[o.name] || '';
    rows.push(`${label}\t${p}\t${o.name}\t${buf.length}\t${h}\t${ref}\t${ref && h.startsWith(ref) ? 'SAME' : 'DIFF'}\t${Date.now() - t0}ms`);
  }
  if (!(j.files || []).length) rows.push(`${label}\t${p}\tno files\t${txt.slice(0, 200)}\t\t\tFAIL`);
}
fs.writeFileSync(path.join(outDir, 'hashes.tsv'), 'platform\tcase\tfile\tbytes\tsha256\treference(Activepieces/browser)\tmatch\ttime\n' + rows.join('\n') + '\n');
console.log(rows.join('\n'));
