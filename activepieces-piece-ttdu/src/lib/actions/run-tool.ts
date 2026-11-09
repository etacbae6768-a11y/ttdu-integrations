import { createAction, Property } from '@activepieces/pieces-framework';
import { ttduAuth } from '../auth';
import { oneStepFlow, runFlow, TtduAuth } from '../client';
import { filesProp, saveOutputs, toTtduFiles } from '../common';

export const runToolAction = createAction({
  auth: ttduAuth,
  name: 'run_tool',
  displayName: 'Run a tool (도구 실행)',
  description: 'Runs one TTDU tool (e.g. pdf.merge, redact.pdf, payroll.check_kr) with options on the given files.',
  props: {
    tool: Property.ShortText({ displayName: 'Tool id', description: 'e.g. pdf.merge, pdf.fit_size, redact.pdf, meta.strip, payroll.check_kr', required: true }),
    scope: Property.StaticDropdown({ displayName: 'Files', required: true, defaultValue: 'each', options: { options: [{ label: 'Each file on its own', value: 'each' }, { label: 'All files together (merge, zip…)', value: 'all' }] } }),
    options: Property.Json({ displayName: 'Options (JSON)', description: 'Tool options as in the tool contract, e.g. {"target_bytes": 2097152}', required: false, defaultValue: {} }),
    files: filesProp,
  },
  async run(ctx) {
    const p = ctx.propsValue;
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(String(p.tool || ''))) throw new Error('Tool id looks wrong: ' + p.tool);
    const flow = oneStepFlow(String(p.tool), (p.options || {}) as Record<string, unknown>, (p.scope as 'each' | 'all') || 'each');
    const r = await runFlow(ctx.auth as unknown as TtduAuth, flow, toTtduFiles(p.files));
    return saveOutputs(ctx.files, r);
  },
});
