// Pure TTDU runner used by the Trigger.dev tasks (no Trigger.dev import, so it can be tested on its own). MIT (c) 2026 Park Jihoon (Tools That Don't Upload).
// Env: TTDU_TARGET=local|hub, TTDU_URL (default local http://127.0.0.1:8790), TTDU_API_KEY.
// Local target works when tasks run on the office PC (`npx trigger.dev dev` or a self-hosted worker on that PC);
// Trigger.dev Cloud workers cannot reach 127.0.0.1 of your office, use the hub target there (files are sent to the hub).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('./ttdu-client.cjs');

export type TtduFileIn = { name?: string; base64?: string; url?: string };
export type TtduPayload = { flow: string | Record<string, unknown>; files: TtduFileIn[]; vars?: Record<string, string>; deliver?: unknown[] };
export type TtduFileOut = { name: string; mime?: string; size: number; sha256: string; base64: string };

export async function runTtdu(payload: TtduPayload, env: Record<string, string | undefined> = process.env) {
  const auth = { target: env.TTDU_TARGET === 'hub' ? 'hub' : 'local', baseUrl: env.TTDU_URL, apiKey: env.TTDU_API_KEY };
  const files = [] as { name?: string; data: Buffer }[];
  for (const f of payload.files || []) {
    if (f.base64) files.push({ name: f.name, data: Buffer.from(f.base64, 'base64') });
    else if (f.url) { const r = await fetch(f.url); if (!r.ok) throw new Error('cannot download ' + f.url + ' HTTP ' + r.status); files.push({ name: f.name, data: Buffer.from(await r.arrayBuffer()) }); }
  }
  const r = await client.runFlow(auth, payload.flow, files, payload.vars || {}, payload.deliver ? { deliver: payload.deliver } : undefined);
  const out: TtduFileOut[] = r.outputs.map((o: any) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, base64: o.data.toString('base64') }));
  return { ok: true, count: out.length, target: auth.target, notes: r.notes, deliveries: r.deliveries || [], files: out };
}
