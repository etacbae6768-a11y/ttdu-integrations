# @ttdu/office-connect — keep TTDU results in the office's own systems

MIT. Node 20+, no dependencies. Optional last step (`deliver`) of a TTDU flow on the office PC runner: after the flow
succeeded and the results were saved locally, send them to

- **Paperless-ngx** (document archive): title, created date, correspondent (거래처), document type, tags, custom fields;
  same file again → `duplicate` (found by checksum, SHA-256 on 3.x / MD5 on 2.x) instead of a second document.
- **Odoo** (19+ JSON-2, or 14–18 JSON-RPC): attach to a record (`res.partner` 거래처, `hr.employee` 직원, …) as
  `ir.attachment` and log a chatter note; same file on the same record → `duplicate` (sha1 checksum).
- **ERPNext / Frappe**: attach to a document (Customer, Supplier, Employee, …) with `upload_file` (private by default) and an optional timeline comment; duplicate by md5 `content_hash`; optional `site` (X-Frappe-Site-Name).

Checked against real instances on 2026-11-09/10: Paperless-ngx 3.4.2, Odoo 19.0, ERPNext 16.54.0, Twenty 2.56.1.
- **Twenty 2.x**: attach to a company/person/opportunity the way Twenty's web app does (createFileUpload → signed PUT → completeFileUpload → attachment with `target<Object>Id`); duplicate = same name on the same record.

Addresses and tokens live only in the office PC's `connectors.json` + `secrets/*.txt` (or env `TTDU_SECRET_<ID>`).
A flow (or an automation tool calling the local API) picks a connector by id; it cannot name a new address.
Only loopback and office-network addresses (private, link-local, CGNAT/VPN) are allowed unless `"allow_public": true`
(refused in locked office delivery builds). The check runs at connect time (DNS answers included); redirects are
never followed; secrets never appear in receipts or logs.

## Where do the files go? What must the office install?

- **Files stay inside the office network.** The office PC runner sends results only to the addresses written in that PC's
  `connectors.json`, and only if they are loopback or office-network addresses (private, link-local, CGNAT/VPN ranges).
  Public addresses are refused unless an administrator sets `"allow_public": true`. Nothing is sent to TTDU.
- **Tokens stay on the office PC** (`secrets/*.txt` or `TTDU_SECRET_<ID>`). Flows and automation tools (Activepieces,
  Node-RED, n8n, ...) only name a connector id (`"to": "paperless"`); they never see addresses or tokens.
- **Paperless-ngx, Odoo, ERPNext and Twenty are installed and run by the office itself, under their own licenses**
  (GPL-3.0, LGPL-3.0, GPL-3.0, AGPL-3.0 with an API exception; see NOTICE.md). They are not part of this repository,
  the TTDU office runner, or any TTDU delivery. This module only calls their published HTTP APIs.
- Use from other blocks in this repository: the `deliver` option (Activepieces "Keep results in office systems",
  Node-RED `msg.deliver`, n8n option, Airflow `deliver=`, Trigger.dev `payload.deliver`). It works only with the
  **This PC** target; the hub refuses it.

## Tests
`npm test` (mock servers, no network). `scripts/e2e-*.mjs` need the TTDU office runner (`TTDU_PLATFORM`), sample files
(`TTDU_DEMO_DIR`) and real instances given in `--config`; they were run on 2026-11-09/10 against Paperless-ngx 3.4.2
(14/14), Odoo 19.0 (10/10), ERPNext 16.54.0 and Twenty 2.56.1.
## Use
```
ttdu-file check  [--config connectors.json]
ttdu-file push   --to paperless --in 결과\ --var client=가나다상회 --tags TTDU,영수증 --correspondent "{client}"
```
In a flow (`ttdu.flow/v1`):
```json
"deliver": [{ "to": "paperless", "only": "pdf", "title": "{client}_{date}", "correspondent": "{client}",
              "document_type": "증빙", "tags": ["TTDU"], "created": "{date}" }]
```
The runner (`ttdu run` / `ttdu ui` / `ttdu serve`) calls `deliver()` and returns receipts
(`deliveries`: `{to, type, file, ok, status: stored|duplicate|queued|failed|skipped, id, url, code, detail}`);
`ttdu serve` also accepts a separate `deliver` field and, for `?raw=1`, sends receipts in `X-TTDU-Deliveries`.

## Files
- `src/net.mjs` guarded HTTP · `src/config.mjs` settings · `src/template.mjs` `{var}` rules · `src/deliver.mjs` dispatcher
- `src/paperless.mjs`, `src/odoo.mjs`, `src/erpnext.mjs`, `src/twenty.mjs`
- `bin/ttdu-file.mjs` CLI · `examples/` settings example, office setup page (KO), flows with `deliver`
- `test/unit.mjs` mock-server tests · `scripts/e2e-*.mjs` real-instance tests (Docker)

See NOTICE.md for the licenses of the connected programs (none of their code is included).
