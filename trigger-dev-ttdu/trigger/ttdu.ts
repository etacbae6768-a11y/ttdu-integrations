// Trigger.dev v4 tasks for TTDU. MIT (c) 2026 Park Jihoon (Tools That Don't Upload). Copy this folder into your Trigger.dev project's `trigger/` dir.
// Task payloads and outputs are stored by your Trigger.dev instance (Cloud, also for `npx trigger.dev dev`).
// Use path mode ({ paths, outDir }) so only file paths and result summaries go there, never file contents.
import { task, schedules, logger } from '@trigger.dev/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { runTtdu, type TtduPayload } from '../src/run';

/**
 * Run a TTDU flow.
 * Path mode (recommended): { flow: 'A'|'B'|'C'|'HWP'|'HWP_TEXT'|ttdu.flow/v1, paths: ['C:/in/a.pdf'], outDir: 'C:/out', vars }
 * Inline mode: { flow, files: [{ name, base64 | url }], vars } - file contents are in the payload and the output.
 */
export const ttduRunFlow = task({
  id: 'ttdu-run-flow',
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: TtduPayload) => {
    const r = await runTtdu(payload);
    logger.info('TTDU done', { mode: r.mode, count: r.count, files: r.files.map((f) => ({ name: f.name, size: f.size, sha256: f.sha256 })) });
    return r;
  },
});

/** Template: every weekday 08:00 (Asia/Seoul) convert the HWP/HWPX files in TTDU_HWP_IN to PDF in TTDU_HWP_OUT (path mode). */
export const ttduDailyHwp = schedules.task({
  id: 'ttdu-daily-hwp-to-pdf',
  cron: { pattern: '0 8 * * 1-5', timezone: 'Asia/Seoul' },
  run: async () => {
    const dir = process.env.TTDU_HWP_IN, outDir = process.env.TTDU_HWP_OUT;
    if (!dir || !outDir) return { ok: true, count: 0, note: 'set TTDU_HWP_IN and TTDU_HWP_OUT' };
    const paths = fs.readdirSync(dir).filter((n) => /\.hwpx?$/i.test(n)).map((n) => path.join(dir, n));
    if (!paths.length) return { ok: true, count: 0 };
    return runTtdu({ flow: 'HWP', paths, outDir });
  },
});
