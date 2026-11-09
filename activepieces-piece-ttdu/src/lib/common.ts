import { Property, ApFile } from '@activepieces/pieces-framework';
import { TtduFile, TtduResult } from './client';

/** files to send: a list of file inputs (each one an Activepieces file: URL, base64 or a file from an earlier step) */
export const filesProp = Property.Array({
  displayName: 'Files',
  description: 'Files to process (from an earlier step, e.g. Gmail attachments, or uploaded).',
  required: true,
  properties: {
    file: Property.File({ displayName: 'File', required: true }),
    name: Property.ShortText({ displayName: 'File name (optional)', description: 'Use when the file comes without a name (e.g. a webhook URL). The extension decides how TTDU treats it.', required: false }),
  },
});

/** file extension from the first bytes when a file comes without a usable name */
export function sniffExt(b: Buffer): string {
  const s = (n: number) => b.subarray(0, n);
  if (s(4).toString('latin1') === '%PDF') return 'pdf';
  if (b[0] === 0x89 && s(4).toString('latin1') === '\x89PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (s(4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (s(8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return /W\0o\0r\0k\0b\0o\0o\0k/.test(b.subarray(0, 65536).toString('latin1')) ? 'xls' : 'hwp';
  if (b[0] === 0x50 && b[1] === 0x4b) { const head = b.subarray(0, 65536).toString('latin1'); return head.includes('xl/') ? 'xlsx' : head.includes('word/') ? 'docx' : head.includes('Contents/') || head.includes('hwp') ? 'hwpx' : 'zip'; }
  const t = b.subarray(0, 4096).toString('utf8');
  return /,/.test(t.split('\n')[0] || '') ? 'csv' : 'txt';
}
export function toTtduFiles(items: unknown): TtduFile[] {
  const list = Array.isArray(items) ? items : [];
  const out: TtduFile[] = [];
  list.forEach((it, i) => {
    const o = (it && typeof it === 'object' ? it : {}) as { file?: ApFile; name?: string };
    const f = (o.file ?? it) as ApFile | undefined;
    if (!f || !f.data) return;
    const data = Buffer.from(f.data);
    let name = (o.name && String(o.name).trim()) || f.filename || '';
    if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) name = (name || 'file' + (i + 1)) + '.' + sniffExt(data);
    out.push({ name: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'), base64: data.toString('base64') });
  });
  if (!out.length) throw new Error('No files given.');
  return out;
}

type FilesWriter = { write(p: { fileName: string; data: Buffer }): Promise<string> };
/** Writes every result file to Activepieces file storage and returns step output. */
export async function saveOutputs(files: FilesWriter, r: TtduResult) {
  const outputs = [];
  for (const o of r.outputs) {
    const data = Buffer.from(o.base64, 'base64');
    const file = await files.write({ fileName: o.name, data });
    outputs.push({ name: o.name, mime: o.mime || null, size: o.size, sha256: o.sha256, file });
  }
  return { ok: true, count: outputs.length, outputs, first: outputs[0] || null, notes: r.notes || [], steps: r.steps || [] };
}
