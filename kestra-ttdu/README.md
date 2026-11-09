# Kestra flows for TTDU

Blueprint-style Kestra flows that run TTDU document flows with a Python Script task (Process runner) and a single-file MIT client `ttdu_client.py` (namespace file).

Setup: upload `namespace-files/ttdu_client.py` to the namespace `ttdu.office`; set secret `TTDU_API_KEY` (OSS: env `SECRET_TTDU_API_KEY` = base64 of the key); set `variables.ttdu_url` / `ttdu_target`.

- `ttdu-run.yml`: inputs `flow` (A/B/C/HWP/HWP_TEXT), files `f1`–`f6`, `client`, `date` → result files as outputs.
- `ttdu-redact-webhook.yml`: Webhook JSON `{files:[{name, base64}]}` → flow C. Kestra limits a webhook message to about 1 MB, so use `ttdu-run` for larger files.
- `ttdu-monthly-payroll.yml`: Schedule (5th, 09:00 Asia/Seoul) → flow B for `payroll/<client>/<YYYY-MM>_*.xlsx`.

Tested on Kestra v2.0.9 (Docker, `server local`). A Java plugin is not provided yet.

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
