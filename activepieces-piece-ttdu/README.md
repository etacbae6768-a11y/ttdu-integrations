# @ttdu/piece-ttdu

Activepieces piece for TTDU (Tools That Don't Upload). It runs TTDU document flows, single tools and HWP/HWPX conversion from an Activepieces flow.

## Where do my files go?

| Connection target | Address | Files |
|---|---|---|
| **Office PC runner** (`local`, recommended) | `http://127.0.0.1:8790` (Docker on the same PC: `http://host.docker.internal:8790`) | Sent only to the TTDU runner (`ttdu serve`) on the same PC. The runner works with outbound network blocked, so files never leave the PC. |
| **Hub** (`hub`) | `https://toolsthatdontupload.com` | Files are uploaded to the TTDU hub for the run (15 MB per request). Only server-capable tools run there; the office flows A/B/C/HWP need the office runner. |

## Install

Self-hosted Activepieces 0.82.0 or later (the bundled pieces-framework 0.32.0 sets this minimum; tested on 0.93.0 Community Edition): **Platform Admin → Pieces → Install piece → NPM registry**, package name `@ttdu/piece-ttdu`, version as published. Offline installs can upload the `.tgz` instead (Install piece → Upload file).

## Connection

- **Where to run**: Office PC runner or TTDU hub API.
- **Address**: leave empty for the default of the chosen target.
- **API key**: office runner = contents of `local-api-key.txt` in the TTDU folder; hub = your hub API key. The office target is checked with `GET /v1/health` when you save.

## Actions

| Action | What it does |
|---|---|
| Run flow | Ready flows A (receipt photos → one PDF), B (Korean payroll check), C (redact resident registration, phone and account numbers), or a pasted `ttdu.flow/v1` JSON. Optional `deliver` (office runner only) keeps results in an office system set up on that PC. |
| Run tool | One TTDU tool by id with its options. |
| Convert HWP | HWP/HWPX → PDF or text. |

Each run returns `{ok, count, outputs:[{name, mime, size, sha256, file}], first, notes, steps, deliveries}`; `file` is an Activepieces file you can pass to Gmail, Slack, Google Drive and other pieces.

## Package contents

`src/index.js` is a single CommonJS bundle that includes `@activepieces/pieces-framework`, `pieces-common` and `shared` (MIT) and their dependencies, so the package has no runtime dependencies. Bundled packages and their licenses: `THIRD-PARTY-NOTICES.md`. Source: https://github.com/etacbae6768-a11y/ttdu-integrations/tree/main/activepieces-piece-ttdu

## License

MIT © 2026 Park Jihoon (Tools That Don't Upload). This package does not include or modify Activepieces itself.
