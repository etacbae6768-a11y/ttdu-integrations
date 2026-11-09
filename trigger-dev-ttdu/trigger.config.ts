// Trigger.dev v4 project config for the TTDU task examples. MIT (c) 2026 Park Jihoon (Tools That Don't Upload).
// Set TRIGGER_PROJECT_REF (from your Trigger.dev project settings) or replace the placeholder.
import { defineConfig } from '@trigger.dev/sdk';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_replace_with_your_project_ref',
  dirs: ['./trigger'],
  maxDuration: 600,
  retries: { enabledInDev: false, default: { maxAttempts: 2 } },
});
