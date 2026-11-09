# Notice — what this package is and is not

`@ttdu/office-connect` (MIT, © 2026 Park Jihoon (Tools That Don't Upload)) is a client that sends files to programs the office installs and
runs itself, through those programs' published HTTP APIs:

| Program | License of that program (checked 2026-11-09, LICENSE file in its repository) | How we connect |
|---|---|---|
| Paperless-ngx | GPL-3.0 | REST API, token auth (`/api/documents/post_document/`) |
| Odoo (Community) | LGPL-3.0 (see its LICENSE and COPYRIGHT files) | JSON-2 API (Odoo 19+) or JSON-RPC (Odoo 14–18), API key |
| ERPNext | GPL-3.0 (the Frappe framework itself is MIT) | Frappe REST API, `token key:secret` |
| Twenty | AGPL-3.0 with the "Twenty Application Exception" (AGPLv3 §7) plus commercial-licensed `@license Enterprise` files | REST + GraphQL API, Bearer API key |

- This package contains **no code, assets or schemas copied from those programs**, links to none of their libraries, and
  installs nothing inside them (no Odoo module, no Frappe app, no Twenty app). It only builds HTTP requests.
- Those programs are **not distributed with this package or with the TTDU office runner**. Each office installs them
  under their own licenses. Names and trademarks belong to their owners; use here is only to say what we connect to.
- Twenty's LICENSE grants an explicit additional permission: an Application that interacts with Twenty only through its
  published HTTP APIs and webhooks may be licensed under terms of the developer's choice.
- Odoo Online (Odoo's cloud) offers the external API only on Custom plans (Odoo documentation); self-hosted Odoo is not
  affected.
