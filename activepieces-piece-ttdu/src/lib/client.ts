// TTDU client: one request shape for both targets.
//  - local: the office PC runner (`ttdu serve`, http://127.0.0.1:8790). Files go from Activepieces to this PC's
//    runner and back; the runner works offline (network blocked), so nothing leaves the PC.
//  - hub: the TTDU hub API (https://toolsthatdontupload.com). Files are sent to the hub for the run.
// Both answer POST /v1/flows/run (multipart: flow, files, vars) ->
// {ok, steps, outputs:[{name, mime, size, sha256, base64}], notes?}. Single tools run as one-step flows.

export type TtduAuth = { target: 'local' | 'hub'; baseUrl?: string; apiKey: string };
export type TtduFile = { name: string; base64: string };
export type TtduOutput = { name: string; mime?: string; size: number; sha256: string; base64: string };
export type TtduResult = { ok: boolean; steps?: unknown[]; outputs: TtduOutput[]; notes?: unknown[]; deliveries?: unknown[] }; // P7 deliver

export const DEFAULT_URL = { local: 'http://127.0.0.1:8790', hub: 'https://toolsthatdontupload.com' } as const;

/** Activepieces passes CustomAuth either as the props object or as { type, props } (newer runtimes). */
export function normAuth(a: unknown): TtduAuth {
  const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  const p = (o['props'] && typeof o['props'] === 'object' ? o['props'] : o) as Record<string, unknown>;
  return { target: p['target'] === 'hub' ? 'hub' : 'local', baseUrl: typeof p['baseUrl'] === 'string' ? (p['baseUrl'] as string) : undefined, apiKey: String(p['apiKey'] ?? '') };
}
export function baseUrlOf(rawAuth: TtduAuth): string {
  const auth = normAuth(rawAuth);
  const u = (auth.baseUrl && auth.baseUrl.trim()) || DEFAULT_URL[auth.target];
  return u.replace(/\/+$/, '');
}

export function isLocalUrl(url: string): boolean {
  try { const h = new URL(url).hostname; return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === 'host.docker.internal'; } catch { return false; }
}

export async function runFlow(rawAuth: TtduAuth, flow: unknown, files: TtduFile[], vars?: Record<string, string>, deliver?: unknown): Promise<TtduResult> {
  const auth = normAuth(rawAuth);
  const url = baseUrlOf(auth) + '/v1/flows/run';
  if (auth.target === 'local' && !isLocalUrl(url)) throw new Error('Local target must be this PC (127.0.0.1, localhost or host.docker.internal): ' + url);
  // multipart/form-data (flow, files, vars): accepted by both the office PC runner and the hub
  const form = new FormData();
  form.append('flow', JSON.stringify(flow));
  form.append('vars', JSON.stringify(vars || {}));
  if (deliver !== undefined && deliver !== null && deliver !== '') { if (auth.target !== 'local') throw new Error('Keeping results in office systems (deliver) works only with the office PC runner.'); form.append('deliver', JSON.stringify(deliver)); } // P7 deliver
  for (const f of files) form.append('files', new Blob([Buffer.from(f.base64, 'base64')]), f.name);
  const res = await fetch(url, { method: 'POST', headers: { 'X-API-Key': auth.apiKey }, body: form, signal: AbortSignal.timeout(10 * 60 * 1000) });
  const text = await res.text();
  let r: TtduResult | null = null;
  try { r = JSON.parse(text); } catch { r = null; }
  if (!res.ok || !r || r.ok !== true || !Array.isArray(r.outputs)) throw new Error('TTDU run failed (HTTP ' + res.status + '): ' + text.slice(0, 500));
  return r;
}

export function oneStepFlow(tool: string, options: Record<string, unknown>, scope: 'each' | 'all' = 'each', outName?: string) {
  const step: Record<string, unknown> = { tool, scope, options };
  if (outName) step['outName'] = outName;
  return { schema: 'ttdu.flow/v1', steps: [step] };
}
