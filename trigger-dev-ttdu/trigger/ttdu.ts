// Trigger.dev v4 tasks for TTDU. MIT (c) 2026 Park Jihoon (Tools That Don't Upload). Copy this folder into your Trigger.dev project's `trigger/` dir.
import { task, schedules, logger } from '@trigger.dev/sdk';
import { runTtdu, type TtduPayload } from '../src/run';

/** Run any TTDU flow: payload { flow: 'A'|'B'|'C'|'HWP'|'HWP_TEXT'|ttdu.flow/v1, files: [{name, base64 | url}], vars } */
export const ttduRunFlow = task({
  id: 'ttdu-run-flow',
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async (payload: TtduPayload) => {
    const r = await runTtdu(payload);
    logger.info('TTDU done', { count: r.count, files: r.files.map((f) => ({ name: f.name, size: f.size, sha256: f.sha256 })) });
    return r;
  },
});

/** Template: convert HWP files every weekday 08:00 (Asia/Seoul) from a list of URLs you keep in env TTDU_HWP_URLS (comma-separated). */
export const ttduDailyHwp = schedules.task({
  id: 'ttdu-daily-hwp-to-pdf',
  cron: { pattern: '0 8 * * 1-5', timezone: 'Asia/Seoul' },
  run: async () => {
    const urls = (process.env.TTDU_HWP_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return { ok: true, count: 0 };
    return runTtdu({ flow: 'HWP', files: urls.map((url) => ({ url, name: url.split('/').pop() })) });
  },
});
