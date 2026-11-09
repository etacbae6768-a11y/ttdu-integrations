// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Last step of a TTDU flow: send the result files to the office's own systems (document archive, ERP, CRM).
// A flow (ttdu.flow/v1) may carry an optional "deliver" list; the runner calls deliver() after the flow succeeded
// and the results are already saved locally. Addresses and secrets come only from the office PC's connectors.json,
// so a flow (or an automation tool calling the local API) can pick a configured connector by id but can never
// name a new address.
//   "deliver": [ { "to": "paperless", "only": "pdf", "title": "{client}_{date}", "correspondent": "{client}",
//                  "document_type": "증빙", "tags": ["TTDU", "영수증"], "created": "{date}" } ]
import { fileVars, ruleMatches, today, mimeOf } from './template.mjs';

const LOADERS = {
  paperless: () => import('./paperless.mjs').then((m) => m.paperless),
  odoo: () => import('./odoo.mjs').then((m) => m.odoo),
  erpnext: () => import('./erpnext.mjs').then((m) => m.erpnext),
  twenty: () => import('./twenty.mjs').then((m) => m.twenty),
};
export async function clientFor(conn) { const make = await LOADERS[conn.type](); return make(conn); }

/** rules: array | single object | null. Throws invalid_input for a malformed list (checked before any run). */
export function checkRules(rules, cfg) {
  if (rules == null) return [];
  const list = Array.isArray(rules) ? rules : [rules];
  if (list.length > 10) throw Object.assign(new Error('deliver: at most 10 rules'), { code: 'invalid_input' });
  list.forEach((r, i) => {
    if (!r || typeof r !== 'object' || typeof r.to !== 'string') throw Object.assign(new Error('deliver[' + i + ']: "to" (connector id) is required'), { code: 'invalid_input', details: { rule: i } });
    if (cfg && !cfg.connectors[r.to]) throw Object.assign(new Error('deliver[' + i + ']: connector "' + r.to + '" is not set up in connectors.json'), { code: 'not_configured', details: { rule: i, to: r.to } });
  });
  return list;
}

const safe = (e) => String((e && e.message) || e || 'failed').replace(/(Token|token|bearer|Bearer)\s+[A-Za-z0-9._:\-]{8,}/g, '$1 ***').slice(0, 400);

/**
 * @param {{outputs:Array<{name:string,bytes:Uint8Array,mime?:string}>, rules:any, vars?:object, flowName?:string,
 *          config:{connectors:object}, dryRun?:boolean, log?:(s:string)=>void}} p
 * @returns {Promise<Array<{to:string,type:string,file:string,ok:boolean,status:string,id?:any,url?:string,code?:string,detail?:string}>>}
 */
export async function deliver({ outputs, rules, vars = {}, flowName = '', config, dryRun = false, log = () => {} }) {
  const list = checkRules(rules, config);
  const receipts = [];
  for (const rule of list) {
    const conn = config.connectors[rule.to];
    const merged = { ...(conn.defaults || {}), ...rule };
    let client;
    try { client = await clientFor(conn); } catch (e) { receipts.push({ to: rule.to, type: conn.type, file: null, ok: false, status: 'failed', code: e.code || 'failed', detail: safe(e) }); continue; }
    const targets = outputs.filter((o) => ruleMatches(merged, o.name));
    if (!targets.length) { receipts.push({ to: rule.to, type: conn.type, file: null, ok: true, status: 'skipped', detail: 'no result file matched this rule' }); continue; }
    for (const o of targets) {
      const v = { today: today(), flow: flowName, ...vars, ...fileVars(o.name) };
      const t0 = Date.now();
      try {
        const r = await client.store({ name: o.name, bytes: o.bytes, mime: o.mime || mimeOf(o.name) }, merged, v, { dryRun });
        const { plan, ...rest } = r; // the plan (resolved names) is echoed only for dry runs
        receipts.push({ to: rule.to, type: conn.type, file: o.name, ok: r.status !== 'queued' || merged.wait === false, ...rest, ...(dryRun ? { plan } : {}) });
        log(`보관 ${rule.to} ${o.name} → ${r.status}${r.id != null ? ' #' + r.id : ''} ${Date.now() - t0}ms`);
      } catch (e) {
        receipts.push({ to: rule.to, type: conn.type, file: o.name, ok: false, status: 'failed', code: e.code || 'failed', detail: safe(e) });
        log(`보관 실패 ${rule.to} ${o.name}: ${e.code || 'failed'} ${safe(e)}`);
      }
    }
  }
  return receipts;
}

/** connection check for every configured connector (used by `ttdu-file check` and the runner's start line) */
export async function checkAll(config) {
  const out = [];
  for (const conn of Object.values(config.connectors)) {
    try { const c = await clientFor(conn); out.push({ id: conn.id, type: conn.type, url: conn.url, ...(await c.ping()) }); }
    catch (e) { out.push({ id: conn.id, type: conn.type, url: conn.url, ok: false, code: e.code || 'failed', detail: safe(e) }); }
  }
  return out;
}
