// Pure TTDU runner used by the Trigger.dev tasks (no Trigger.dev import, so it can be tested on its own). MIT (c) 2026 Park Jihoon (Tools That Don't Upload).
// Env: TTDU_TARGET=local|hub, TTDU_URL (default local http://127.0.0.1:8790), TTDU_API_KEY.
//
// Where document data goes:
// - Task payloads and outputs are stored by the Trigger.dev instance the worker talks to. With Trigger.dev Cloud
//   (also `npx trigger.dev dev`, which connects to the cloud) they leave the machine.
// - So for the local target use path mode: the payload carries file PATHS on the worker machine and an output folder,
//   the worker reads the files, sends them only to the TTDU runner on 127.0.0.1, writes the results to disk and returns
//   names, sizes and SHA-256 only. File contents never enter the payload or the output.
// - Inline mode (`files: [{name, base64 | url}]`) puts file contents in the payload/output; use it only with a
//   self-hosted Trigger.dev, or with data you are fine sending to Trigger.dev Cloud.
// - The hub target uploads files to the TTDU hub and runs only server-capable flows (e.g. pdf.merge); the office
//   flows A/B/C/HWP need the local runner (the hub answers 422 unsupported).
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('./ttdu-client.cjs');

export type TtduFileIn = { name?: string; base64?: string; url?: string };
export type TtduPayload = {
  flow: string | Record<string, unknown>;
  /** path mode: files on the worker machine */
  paths?: string[];
  /** path mode: folder for the results (created if missing) */
  outDir?: string;
  /** inline mode: file contents in the payload */
  files?: TtduFileIn[];
  vars?: Record<string, string>;
  deliver?: unknown[];
};
export type TtduFileOut = { name: string; mime?: string; size: number; sha256: string; base64?: string; path?: string };

export async function runTtdu(payload: TtduPayload, env: Record<string, string | undefined> = process.env) {
  const auth = { target: env.TTDU_TARGET === 'hub' ? 'hub' : 'local', baseUrl: env.TTDU_URL, apiKey: env.TTDU_API_KEY };
  const pathMode = Array.isArray(payload.paths) && payload.paths.length > 0;
  if (pathMode && !payload.outDir) throw new Error('outDir is required with paths');
  if (pathMode && payload.files && payload.files.length) throw new Error('use either paths or files, not both');
  const files = [] as { name?: string; data: Buffer }[];
  if (pathMode) {
    for (const p of payload.paths as string[]) files.push({ name: path.basename(p), data: fs.readFileSync(p) });
  } else {
    for (const f of payload.files || []) {
      if (f.base64) files.push({ name: f.name, data: Buffer.from(f.base64, 'base64') });
      else if (f.url) { const r = await fetch(f.url); if (!r.ok) throw new Error('cannot download ' + f.url + ' HTTP ' + r.status); files.push({ name: f.name, data: Buffer.from(await r.arrayBuffer()) }); }
    }
  }
  const r = await client.runFlow(auth, payload.flow, files, payload.vars || {}, payload.deliver ? { deliver: payload.deliver } : undefined);
  let out: TtduFileOut[];
  if (pathMode) {
    fs.mkdirSync(payload.outDir as string, { recursive: true });
    out = r.outputs.map((o: any) => { const p = path.join(payload.outDir as string, o.name); fs.writeFileSync(p, o.data); return { name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, path: p }; });
  } else {
    out = r.outputs.map((o: any) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, base64: o.data.toString('base64') }));
  }
  return { ok: true, count: out.length, target: auth.target, mode: pathMode ? 'paths' : 'inline', notes: r.notes, deliveries: r.deliveries || [], files: out };
}
