# node-red-contrib-ttdu

Node-RED nodes that run TTDU document flows (receipt photos → PDF, payroll check, personal-data redaction, HWP → PDF) on **this PC's offline runner** or the TTDU hub API.

Nodes: **ttdu-config** (connection: target, URL, API key) and **ttdu run** (flow A/B/C/HWP/HWP_TEXT/custom/from msg.flow).

Input: `msg.files = [{name, data: Buffer}]`, uploads from an *http in* node (`msg.req.files`), or `msg.payload` Buffer + `msg.filename` (e.g. from *file in*). `msg.vars` (e.g. `{client, date}`) is merged over the node's vars.
Output: `msg.payload = [{name, mime, size, sha256, data: Buffer}]`, `msg.filename` (first result), `msg.inputFilename`, `msg.ttdu = {ok, count, steps, notes, target}`. Errors go to *catch* nodes.

Install: Manage palette → Install → `node-red-contrib-ttdu` (or `npm install node-red-contrib-ttdu` in `~/.node-red`). Requires Node-RED 3+ and Node.js 18+. Tested on Node-RED 4.1.2 and 5.0.9.

Examples (Import → Examples → node-red-contrib-ttdu): 01–04 HTTP endpoints for A/B/C/HWP, 05 folder watch → redact → output folder, 06 folder watch → HWP → PDF.

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
