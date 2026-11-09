// Offline unit test for the deliver option: a mock runner on 127.0.0.1 checks the multipart fields and answers with
// deliveries. Covers the JS client (common), the Python client (airflow/kestra) and, if built, the Activepieces client.
// usage: node common/test/unit-deliver.mjs [path to bundled piece client.cjs]
import http from 'node:http'; import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process';
import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const seen = [];
const srv = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks).toString('latin1');
    const field = (n) => { const m = body.match(new RegExp('name="' + n + '"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--')); return m ? m[1] : null; };
    const d = field('deliver'); seen.push({ key: req.headers['x-api-key'], deliver: d, vars: field('vars') });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, steps: [], notes: [], outputs: [{ name: 'x.pdf', mime: 'application/pdf', size: 3, sha256: 'b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c', base64: Buffer.from('foo').toString('base64') }].map((o) => ({ ...o, base64: Buffer.from('foo\n').toString('base64'), size: 4 })), deliveries: d ? JSON.parse(d).map((r) => ({ to: r.to, ok: true, id: 7 })) : [] }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + srv.address().port; const rules = [{ to: 'paperless', only: 'pdf', tags: ['TTDU'] }];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
// 1. JS client
const c = require(path.join(root, 'common/ttdu-client.cjs'));
const r1 = await c.runFlow({ target: 'local', baseUrl: url, apiKey: 'k' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF-1') }], {}, { deliver: rules });
ok(seen.at(-1).deliver === JSON.stringify(rules), 'js: deliver field sent as JSON');
ok(r1.deliveries.length === 1 && r1.deliveries[0].id === 7, 'js: deliveries returned');
await c.runFlow({ target: 'local', baseUrl: url, apiKey: 'k' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF-1') }], {});
ok(seen.at(-1).deliver === null, 'js: no deliver field when not given');
let threw = false; try { await c.runFlow({ target: 'hub', apiKey: 'k' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF-1') }], {}, { deliver: rules }); } catch (e) { threw = /office PC runner/.test(e.message); }
ok(threw, 'js: hub target refuses deliver before sending');
// 2. Python client (stdlib) — run in a child process
const py = `import sys,json; sys.path.insert(0, r'${path.join(root, 'airflow-provider-ttdu')}')
from ttdu_provider import client as c
r = c.run_flow('C', [('a.pdf', b'%PDF-1')], api_key='k', url='${url}', deliver=${JSON.stringify(JSON.stringify(rules))})
print(json.dumps(r['deliveries']))
try:
    c.run_flow('C', [('a.pdf', b'%PDF-1')], api_key='k', target='hub', deliver=[{'to':'paperless'}]); print('NOERR')
except c.TtduError as e:
    print('HUBERR' if 'office PC runner' in str(e) else 'OTHER')`;
const pyOut = await new Promise((resolve) => { import('node:child_process').then(({ execFile }) => execFile(process.env.PYTHON || 'python', ['-c', py], (e, so, se) => resolve((so || '') + (se || '')))); });
ok(/"id": 7/.test(pyOut), 'py: deliveries returned'); ok(seen.at(-1).deliver === JSON.stringify(rules), 'py: deliver field sent'); ok(/HUBERR/.test(pyOut), 'py: hub target refuses deliver'); if (!/HUBERR/.test(pyOut)) console.log(pyOut.slice(0, 800));
// 3. Activepieces piece client (bundled with esbuild by the caller)
const pc = process.argv[2];
if (pc && fs.existsSync(pc)) {
  const p = require(pc);
  const r3 = await p.runFlow({ target: 'local', baseUrl: url, apiKey: 'k' }, { schema: 'ttdu.flow/v1', steps: [] }, [{ name: 'a.pdf', base64: Buffer.from('%PDF-1').toString('base64') }], {}, rules);
  ok(seen.at(-1).deliver === JSON.stringify(rules) && r3.deliveries.length === 1, 'piece: deliver sent, deliveries returned');
  let t = false; try { await p.runFlow({ target: 'hub', apiKey: 'k' }, {}, [{ name: 'a.pdf', base64: 'AA==' }], {}, rules); } catch (e) { t = /office PC runner/.test(e.message); }
  ok(t, 'piece: hub target refuses deliver');
} else console.log('SKIP piece (no bundled client given)');
srv.close(); console.log(`unit-deliver: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);


