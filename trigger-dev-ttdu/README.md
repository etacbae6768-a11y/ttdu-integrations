# Trigger.dev tasks for TTDU

Trigger.dev v4 tasks (copy `trigger/` and `src/` into your project, or run this folder as a project): `ttdu-run-flow` and `ttdu-daily-hwp-to-pdf` (weekday 08:00 Asia/Seoul).

Run: `npm install`, set `TRIGGER_PROJECT_REF`, then `npx trigger.dev@latest dev` or `npx trigger.dev@latest deploy`. Env: `TTDU_TARGET` (local/hub), `TTDU_URL`, `TTDU_API_KEY`.

## Where does document data go with Trigger.dev?

Trigger.dev stores every task payload and output in the Trigger.dev instance the worker talks to. With Trigger.dev Cloud (this includes `npx trigger.dev dev`, which connects to the cloud) payloads and outputs leave your machine.

- **Path mode (use this with the local runner):** payload `{ flow, paths: ["C:/in/a.pdf"], outDir: "C:/out", vars }`. The worker reads the files from disk, sends them only to the TTDU runner on 127.0.0.1 (which works offline), writes the results to `outDir` and returns names, sizes and SHA-256. File contents never enter the payload or the output; only paths and result summaries go to Trigger.dev.
- **Inline mode:** payload `{ flow, files: [{ name, base64 | url }] }`, output with base64 results. File contents are in the payload and output, so use it only with a self-hosted Trigger.dev, or for data you are fine sending to Trigger.dev Cloud.
- To keep all task data (payloads, outputs, logs) on your own machines, self-host Trigger.dev and run the worker there too.
- The office flows A, B, C and HWP need the local runner. The TTDU hub API (`TTDU_TARGET=hub`) uploads the files to the hub and runs only server-capable flows such as `pdf.merge`; for the office flows it answers `422 unsupported`.

Checked: both modes against the office runner (same result bytes as the browser); type check against `@trigger.dev/sdk` 4.8.3. Not run inside a Trigger.dev server.
## Where do my files go?

| Target | URL | Files |
|---|---|---|
| **This PC** (`local`) | `http://127.0.0.1:8790` (the TTDU office runner, `ttdu serve`) | Sent only to the runner on the same PC. The runner works with outbound network blocked, so **files never leave the PC**. |
| **Hub** (`hub`) | `https://toolsthatdontupload.com` | **Files are uploaded to the TTDU hub** for the run (15 MB per request). Only server-capable tools run there (e.g. `pdf.merge`); the office flows A/B/C/HWP answer `422 unsupported` on the hub - run them on This PC. |

If the automation tool runs in Docker Desktop, use `http://host.docker.internal:8790` and start the runner with `--allow-docker` (the "local API, allow Docker" launcher in the office package). The runner still listens on 127.0.0.1 only and still needs the API key (`local-api-key.txt`).

## Ready flows

| id | What it does | Input | Output |
|---|---|---|---|
| `A` | Receipt photos → one PDF, named `{client}_{date}.pdf`, ≤ 1 MB | images | 1 PDF |
| `B` | Payroll check (4 insurances, income tax recalculated); period read from the file name `YYYY-MM_…xlsx` | 1 xlsx | `{client}_<payroll check>_{date}.xlsx` (Korean file name) |
| `C` | Redact resident registration numbers, phone numbers, account numbers | PDF / images | `*-redacted-clean.*` |
| `HWP` / `HWP_TEXT` | HWP/HWPX → PDF / text | hwp, hwpx | PDF / txt |
| custom | any `ttdu.flow/v1` JSON exported from https://workflows.toolsthatdontupload.com | | |

API: `POST /v1/flows/run` (multipart `flow`, `vars`, `files`; header `X-API-Key`) → `{ok, steps, notes, outputs:[{name, mime, size, sha256, base64}]}`.
## License

MIT © 2026 Park Jihoon (Tools That Don't Upload). This package contains only our code. It does not include or modify the host platform's code.
