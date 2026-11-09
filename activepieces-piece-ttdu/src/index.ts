// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// TTDU piece for Activepieces: run TTDU flows and tools without uploading files (office PC runner) or on the hub.
import { createPiece } from '@activepieces/pieces-framework';
import { ttduAuth } from './lib/auth';
import { runFlowAction } from './lib/actions/run-flow';
import { runToolAction } from './lib/actions/run-tool';
import { convertHwpAction } from './lib/actions/convert-hwp';

export const ttdu = createPiece({
  displayName: 'TTDU (Tools That Don\'t Upload)',
  description: 'PDF, image, table, payroll check and HWP tools that run on your own PC. Run a saved flow, one tool, or an HWP conversion.',
  logoUrl: 'https://toolsthatdontupload.com/favicon.svg',
  authors: ['ttdu'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: ['PRODUCTIVITY' as any],
  minimumSupportedRelease: '0.30.0',
  auth: ttduAuth,
  actions: [runFlowAction, runToolAction, convertHwpAction],
  triggers: [],
});
