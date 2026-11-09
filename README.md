# TTDU integrations

Blocks for automation tools that run [TTDU](https://toolsthatdontupload.com) document flows: receipt photos → one PDF, Korean payroll check, personal-data redaction, HWP/HWPX → PDF, or any `ttdu.flow/v1` flow.

| Folder | Platform | Package |
|---|---|---|
| [`node-red-contrib-ttdu`](node-red-contrib-ttdu) | Node-RED 3+ (tested 4.1.2, 5.0.9) | npm `node-red-contrib-ttdu` |
| [`n8n-nodes-ttdu`](n8n-nodes-ttdu) | n8n (tested 2.46.7) | npm `n8n-nodes-ttdu` (community node) |
| [`airflow-provider-ttdu`](airflow-provider-ttdu) | Apache Airflow (tested 3.4.0) | PyPI `airflow-provider-ttdu` |
| [`kestra-ttdu`](kestra-ttdu) | Kestra (tested v2.0.9) | flows + `ttdu_client.py` |
| [`trigger-dev-ttdu`](trigger-dev-ttdu) | Trigger.dev v4 | task examples |
| [`activepieces-piece-ttdu`](activepieces-piece-ttdu) | Activepieces (tested 0.93.0) | piece `@ttdu/piece-ttdu` |
| [`office-systems`](office-systems) | Paperless-ngx, Odoo, ERPNext, Twenty (installed by the office) | `@ttdu/office-connect` (API client, used by the office runner's `deliver` step) |
| [`common`](common) | shared client (`ttdu-client.cjs`), ready flows (`presets.json`), test runner | |

## Where do my files go?

- **This PC** (`local`, `http://127.0.0.1:8790`): files go only to the TTDU office runner on the same computer, which runs with outbound network blocked. **Files never leave the PC.**
- **Hub** (`hub`, `https://toolsthatdontupload.com`): files are uploaded to the TTDU hub for the run (15 MB per request). Only server-capable tools run there; the office flows A/B/C/HWP answer `422 unsupported` on the hub.

Optional `deliver` rules (This PC only) keep the results in the office's own systems through `office-systems`; addresses and tokens stay in the office PC's `connectors.json`.

All blocks call the same API: `POST /v1/flows/run` (multipart `flow`, `vars`, `files`; header `X-API-Key`) → `{ok, steps, notes, outputs:[{name, mime, size, sha256, base64}]}`.

## Tests

Each block was run against the office runner with the same sample files; the result files are byte-identical across all platforms (SHA-256). Test scripts read `TTDU_DEMO_DIR` / `TTDU_SAMPLES_DIR`, the samples are not in this repository. `node scripts/sync-common.mjs` copies the shared client into each package.

## License

MIT, see [LICENSE](LICENSE). Only our code is here; no code from Node-RED, n8n, Airflow, Kestra, Trigger.dev or Activepieces is included. n8n is under the Sustainable Use License: install it yourself; this repository does not ship it.
