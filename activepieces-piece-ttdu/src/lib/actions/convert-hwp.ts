import { createAction, Property } from '@activepieces/pieces-framework';
import { ttduAuth } from '../auth';
import { oneStepFlow, runFlow, TtduAuth } from '../client';
import { saveOutputs } from '../common';

const TOOLS: Record<string, string> = { pdf: 'hwp.to_pdf', text: 'hwp.extract_text' };

export const convertHwpAction = createAction({
  auth: ttduAuth,
  name: 'convert_hwp',
  displayName: 'Convert HWP (HWP 변환)',
  description: 'Converts a Hangul document (HWP, HWPX) to PDF or plain text.',
  props: {
    file: Property.File({ displayName: 'HWP/HWPX file', required: true }),
    to: Property.StaticDropdown({ displayName: 'To', required: true, defaultValue: 'pdf', options: { options: [{ label: 'PDF', value: 'pdf' }, { label: 'Text (TXT)', value: 'text' }] } }),
  },
  async run(ctx) {
    const f = ctx.propsValue.file;
    const tool = TOOLS[String(ctx.propsValue.to)] || TOOLS['pdf'];
    const flow = oneStepFlow(tool, {}, 'each');
    const r = await runFlow(ctx.auth as unknown as TtduAuth, flow, [{ name: f.filename || 'document.hwp', base64: Buffer.from(f.data).toString('base64') }]);
    return saveOutputs(ctx.files, r);
  },
});
