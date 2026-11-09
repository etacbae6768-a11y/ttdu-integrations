// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// {name} templates in delivery rules: flow vars (client, date, ...) plus file, stem, ext, today, flow.
export function today() { const d = new Date(); return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
export function fileVars(name) { const n = String(name || ''); const i = n.lastIndexOf('.'); return { file: n, stem: i > 0 ? n.slice(0, i) : n, ext: i > 0 ? n.slice(i + 1).toLowerCase() : '' }; }

/** fills {key}; a key with no value is an error (we never send "{client}" literally) */
export function fill(t, vars) {
  if (t == null) return t;
  const missing = [];
  const s = String(t).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => { const v = vars[k]; if (v == null || v === '') { missing.push(k); return m; } return String(v); });
  if (missing.length) throw Object.assign(new Error('No value for ' + missing.map((k) => '{' + k + '}').join(', ') + ' in the delivery rule.'), { code: 'needs_input', details: { reason: 'vars', missing } });
  return s;
}
export function fillAll(v, vars) {
  if (typeof v === 'string') return fill(v, vars);
  if (Array.isArray(v)) return v.map((x) => fillAll(x, vars));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = fillAll(v[k], vars); return o; }
  return v;
}
/** 20261106 / 2026-11-06 / 2026.11.06 -> 2026-11-06 (real calendar date), else null */
export function isoDate(s) {
  const m = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})$/.exec(String(s || '').trim()); if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const KINDS = { pdf: /\.pdf$/i, xlsx: /\.(xlsx|xlsm|xls)$/i, image: /\.(jpe?g|png|webp|gif|tiff?|bmp|heic)$/i, hwp: /\.(hwp|hwpx)$/i, docx: /\.docx$/i, csv: /\.csv$/i, text: /\.(txt|md)$/i };
/** rule.only: 'pdf' | 'xlsx' | ['pdf','xlsx'] | 'any' (default) ; rule.match: regex on the file name */
export function ruleMatches(rule, name) {
  const only = rule.only == null || rule.only === 'any' ? null : [].concat(rule.only);
  if (only && !only.some((k) => KINDS[k] && KINDS[k].test(name))) return false;
  if (rule.match) { let re; try { re = new RegExp(rule.match, 'i'); } catch (e) { throw Object.assign(new Error('rule.match is not a valid pattern'), { code: 'invalid_input' }); } if (!re.test(name)) return false; }
  return true;
}
export function mimeOf(name) {
  const n = String(name).toLowerCase();
  return n.endsWith('.pdf') ? 'application/pdf' : /\.jpe?g$/.test(n) ? 'image/jpeg' : n.endsWith('.png') ? 'image/png' : n.endsWith('.webp') ? 'image/webp' : n.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : n.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : n.endsWith('.csv') ? 'text/csv' : n.endsWith('.txt') ? 'text/plain' : n.endsWith('.zip') ? 'application/zip' : 'application/octet-stream';
}
