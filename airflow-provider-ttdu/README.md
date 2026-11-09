# airflow-provider-ttdu

Apache Airflow provider (unofficial, not an Apache Software Foundation project) that runs TTDU document flows from DAGs on **this PC's offline runner** or the TTDU hub API.

- Connection type `ttdu`: Host = runner/hub URL, Password = API key, Extra `{"target": "local"}` or `{"target": "hub"}`.
- `TtduHook(ttdu_conn_id).run_flow(flow, files, vars)`
- `TtduRunFlowOperator(flow="C", input_paths=["/in/*.pdf"], output_dir="/out", vars={...})` writes the result files to `output_dir` and returns `{ok, count, notes, files:[{name, size, sha256, path}]}` as XCom (no file bytes in XCom).

`pip install airflow-provider-ttdu`. Pure standard library client. Tested on Airflow 3.4.0 (`airflow dags test`); Airflow 2.7+ imports are supported in code but not tested.

Example DAGs: `ttdu_office_demo` (A, B, C, HWP), `ttdu_monthly_payroll_check` (5th of month, one task per client folder), `ttdu_folder_hwp_to_pdf` (FileSensor → HWP → PDF).

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
