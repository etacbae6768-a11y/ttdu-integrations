#!/usr/bin/env node
// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// ttdu-file: keep result files in the office's own systems (Paperless-ngx, Odoo, ERPNext, Twenty).
//   ttdu-file check [--config connectors.json]
//       -> tries every connector in connectors.json (address, token) and prints one line each
//   ttdu-file push --to <connector id> --in <file|folder> [--in ...] [--var key=value ...] [--rule rule.json]
//                  [--title T] [--tags a,b] [--correspondent C] [--document-type D] [--created YYYYMMDD]
//                  [--model res.partner --find name={client}] [--doctype Customer] [--object company]
//                  [--only pdf] [--dry-run] [--json] [--config connectors.json]
//       -> stores the files (for results that are already in a folder, e.g. 결과\)
// Exit code: 0 all stored (or duplicates), 3 some failed, 2 usage / settings error.
import fs from 'node:fs';
import path from 'node:path';
import { loadConnectors, describe, defaultConfigFile } from '../src/config.mjs';
import { deliver, checkAll } from '../src/deliver.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const many = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []));
const usage = 'usage: ttdu-file check [--config connectors.json] | ttdu-file push --to <id> --in <file|folder> [--var key=value] [--rule rule.json] [--title T] [--tags a,b] [--correspondent C] [--document-type D] [--created YYYYMMDD] [--model M --find field=value] [--doctype D] [--object O] [--only pdf] [--dry-run] [--json]';

async function main() {
  const cmd = argv[0];
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(usage); return 0; }
  const cfgFile = flag('--config') || defaultConfigFile(process.cwd());
  let cfg;
  try { cfg = loadConnectors(cfgFile); } catch (e) { console.error((e.code ? e.code + ': ' : '') + e.message); return 2; }
  if (cmd === 'check') {
    for (const l of describe(cfg)) console.log(l);
    const res = await checkAll(cfg);
    for (const r of res) console.log(r.ok ? `OK   ${r.id}: ${r.type}${r.server_version ? ' ' + r.server_version : ''}${r.api_version ? ' (API ' + r.api_version + ')' : ''}${r.user ? ' as ' + r.user : ''}` : `FAIL ${r.id}: ${r.code} ${r.detail}`);
    if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
    return res.every((r) => r.ok) ? 0 : 3;
  }
  if (cmd !== 'push') { console.error(usage); return 2; }
  const to = flag('--to'); const ins = many('--in');
  if (!to || !ins.length) { console.error(usage); return 2; }
  const vars = {}; for (const kv of many('--var')) { const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(kv); if (m) vars[m[1]] = m[2]; }
  let rule = { to };
  if (flag('--rule')) rule = { ...JSON.parse(fs.readFileSync(flag('--rule'), 'utf8').replace(/^\uFEFF/, '')), to };
  const set = (k, v) => { if (v !== undefined) rule[k] = v; };
  set('title', flag('--title')); set('correspondent', flag('--correspondent')); set('document_type', flag('--document-type')); set('created', flag('--created'));
  if (flag('--tags')) rule.tags = flag('--tags').split(',').map((s) => s.trim()).filter(Boolean);
  set('model', flag('--model')); set('doctype', flag('--doctype')); set('object', flag('--object')); set('only', flag('--only'));
  if (many('--find').length) { rule.find = {}; for (const kv of many('--find')) { const m = /^([A-Za-z0-9_.]+)=(.*)$/.exec(kv); if (m) rule.find[m[1]] = m[2]; } }
  const paths = ins.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((n) => fs.statSync(path.join(p, n)).isFile()).sort((a, b) => a.localeCompare(b)).map((n) => path.join(p, n)) : [p]));
  if (!paths.length) { console.error('no files'); return 2; }
  const outputs = paths.map((p) => ({ name: path.basename(p), bytes: new Uint8Array(fs.readFileSync(p)) }));
  const receipts = await deliver({ outputs, rules: [rule], vars, config: cfg, dryRun: argv.includes('--dry-run'), log: (s) => console.log(s) });
  if (argv.includes('--json')) console.log(JSON.stringify(receipts, null, 2));
  else for (const r of receipts) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.file || '-'} → ${r.to}: ${r.status}${r.id != null ? ' #' + r.id : ''}${r.url ? ' ' + r.url : ''}${r.detail ? ' (' + r.detail + ')' : ''}`);
  return receipts.every((r) => r.ok) ? 0 : 3;
}
main().then((c) => { process.exitCode = c; }, (e) => { console.error((e && e.code ? e.code + ': ' : '') + ((e && e.message) || e)); process.exitCode = 2; });
