// Generates Node-RED example flows (examples/*.json) and the docker test flow (test/test-flows.local.json, has the key - not shipped).
// usage: node gen-flows.cjs <serve port> <key file>
const fs = require('fs'); const path = require('path');
let n = 0; const id = (p) => p + (++n).toString(16).padStart(8, '0');
const cfg = (baseUrl) => ({ id: 'ttducfg00001', type: 'ttdu-config', name: 'TTDU this PC', target: 'local', baseUrl });
const LABEL = { A: 'A 증빙사진→PDF', B: 'B 급여 검수', C: 'C 개인정보 가리기', HWP: 'HWP→PDF' };
function httpFlow(z, preset, y) {
  const [h, v, t, s, r, c, e] = ['h', 'v', 't', 's', 'r', 'c', 'e'].map(id);
  return [
    { id: c, z, type: 'catch', name: 'TTDU error', scope: [t], uncaught: false, x: 640, y: y + 40, wires: [[e]] },
    { id: e, z, type: 'function', name: 'error -> 500', func: "msg.statusCode = 500;\nmsg.payload = { ok: false, error: msg.error && msg.error.message };\nreturn msg;", outputs: 1, x: 840, y: y + 40, wires: [[r]] },
    { id: h, z, type: 'http in', name: 'POST /ttdu/' + preset.toLowerCase() + ' (multipart files, client, date)', url: '/ttdu/' + preset.toLowerCase(), method: 'post', upload: true, x: 220, y, wires: [[v]] },
    { id: v, z, type: 'function', name: 'vars from form', func: "const b = msg.req.body || {};\nmsg.vars = {};\nif (b.client) msg.vars.client = b.client;\nif (b.date) msg.vars.date = b.date;\nreturn msg;", outputs: 1, x: 460, y, wires: [[t]] },
    { id: t, z, type: 'ttdu-run', name: LABEL[preset], server: 'ttducfg00001', flow: preset, flowJson: '', vars: '', x: 640, y, wires: [[s]] },
    { id: s, z, type: 'function', name: 'summary + files (base64)', func: "msg.payload = { ok: msg.ttdu.ok, count: msg.ttdu.count, notes: msg.ttdu.notes, files: msg.payload.map(o => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, base64: o.data.toString('base64') })) };\nreturn msg;", outputs: 1, x: 840, y, wires: [[r]] },
    { id: r, z, type: 'http response', name: '', statusCode: '', headers: {}, x: 1020, y, wires: [] },
  ];
}
function folderFlow(z, preset, inDir, outDir, pattern) {
  const [w, sw, fi, t, sp, nm, fw] = ['w', 'q', 'f', 't', 'p', 'm', 'o'].map(id);
  return [
    { id: w, z, type: 'watch', name: 'watch ' + inDir, files: inDir, recursive: false, x: 160, y: 80, wires: [[sw]] },
    { id: sw, z, type: 'switch', name: 'new file ' + pattern, property: 'filename', propertyType: 'msg', rules: [{ t: 'regex', v: pattern, vt: 'str', case: true }], checkall: 'true', outputs: 1, x: 360, y: 80, wires: [[fi]] },
    { id: fi, z, type: 'file in', name: 'read file', filename: 'filename', filenameType: 'msg', format: '', allProps: false, x: 540, y: 80, wires: [[t]] },
    { id: t, z, type: 'ttdu-run', name: LABEL[preset], server: 'ttducfg00001', flow: preset, flowJson: '', vars: '', x: 720, y: 80, wires: [[sp]] },
    { id: sp, z, type: 'split', name: 'one msg per result', splt: '\\n', spltType: 'str', arraySplt: 1, arraySpltType: 'len', stream: false, addname: '', x: 900, y: 80, wires: [[nm]] },
    { id: nm, z, type: 'function', name: 'name in ' + outDir, func: "// one result from one input: keep the input's base name (h-001.hwpx -> h-001.pdf)\nconst base = String(msg.inputFilename || '').split(/[\\\\/]/).pop().replace(/\\.[^.]+$/, '');\nconst ext = (msg.payload.name.match(/\\.[^.]+$/) || [''])[0];\nconst name = msg.ttdu.count === 1 && base ? base + ext : msg.payload.name;\nmsg.filename = " + JSON.stringify(outDir) + " + '/' + name;\nmsg.payload = msg.payload.data;\nreturn msg;", outputs: 1, x: 1080, y: 80, wires: [[fw]] },
    { id: fw, z, type: 'file', name: 'write result', filename: 'filename', filenameType: 'msg', appendNewline: false, createDir: true, overwriteFile: 'true', encoding: 'none', x: 1260, y: 80, wires: [[]] },
  ];
}
const out = path.join(__dirname, '..', 'examples'); fs.mkdirSync(out, { recursive: true });
const ex = {
  '01-http-A-receipts-to-pdf': (z) => httpFlow(z, 'A', 80),
  '02-http-B-payroll-check': (z) => httpFlow(z, 'B', 80),
  '03-http-C-redact': (z) => httpFlow(z, 'C', 80),
  '04-http-HWP-to-pdf': (z) => httpFlow(z, 'HWP', 80),
  '05-folder-C-redact-scans': (z) => folderFlow(z, 'C', 'C:/TTDU/in-redact', 'C:/TTDU/out-redact', '\\.(pdf|png|jpe?g)$'),
  '06-folder-HWP-to-pdf': (z) => folderFlow(z, 'HWP', 'C:/TTDU/in-hwp', 'C:/TTDU/out-pdf', '\\.hwpx?$'),
};
for (const [name, mk] of Object.entries(ex)) { const z = id('tab'); fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify([{ id: z, type: 'tab', label: 'TTDU ' + name }, cfg('http://127.0.0.1:8790'), ...mk(z)], null, 2)); }
const port = process.argv[2] || '8790', key = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8').trim() : '';
const z = 'tabtest00001';
const test = [{ id: z, type: 'tab', label: 'TTDU test' }, Object.assign(cfg('http://host.docker.internal:' + port), { credentials: { apiKey: key } }), ...httpFlow(z, 'A', 80), ...httpFlow(z, 'B', 160), ...httpFlow(z, 'C', 240), ...httpFlow(z, 'HWP', 320)];
fs.writeFileSync(path.join(__dirname, 'test-flows.local.json'), JSON.stringify(test));
console.log('examples', Object.keys(ex).length, 'test nodes', test.length);
