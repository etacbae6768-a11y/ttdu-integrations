import { createAction, Property } from '@activepieces/pieces-framework';
import { ttduAuth } from '../auth';
import { runFlow, TtduAuth } from '../client';
import { filesProp, saveOutputs, toTtduFiles } from '../common';
import { PRESET_FLOWS } from '../presets';

export const runFlowAction = createAction({
  auth: ttduAuth,
  name: 'run_flow',
  displayName: 'Run a flow (흐름 실행)',
  description: 'Runs a saved TTDU flow (ttdu.flow/v1) on the given files and returns the result files.',
  props: {
    preset: Property.StaticDropdown({
      displayName: 'Flow',
      description: 'A ready flow, or "custom" to paste a flow exported from the TTDU workflows page (내보내기 → 흐름 JSON).',
      required: true,
      defaultValue: 'C',
      options: { options: [
        ...Object.keys(PRESET_FLOWS).map((k) => ({ label: k + '. ' + PRESET_FLOWS[k].name, value: k })),
        { label: 'Custom flow JSON (직접 붙여넣기)', value: 'custom' },
      ] },
    }),
    flowJson: Property.Json({ displayName: 'Custom flow JSON', description: 'Only used when Flow = custom.', required: false }),
    files: filesProp,
    vars: Property.Object({ displayName: 'Name values (vars)', description: 'Values for file-name rules, e.g. client = 가나다상회, date = 20261106 (date defaults to today).', required: false }),
  },
  async run(ctx) {
    const p = ctx.propsValue;
    const flow = p.preset === 'custom' ? p.flowJson : PRESET_FLOWS[p.preset as string];
    if (!flow || typeof flow !== 'object') throw new Error('No flow: choose a ready flow or paste a custom flow JSON.');
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries((p.vars || {}) as Record<string, unknown>)) if (v !== undefined && v !== null && v !== '') vars[k] = String(v);
    const r = await runFlow(ctx.auth as unknown as TtduAuth, flow, toTtduFiles(p.files), vars);
    return saveOutputs(ctx.files, r);
  },
});
