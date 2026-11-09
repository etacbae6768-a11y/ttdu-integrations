"""TTDU connection spec v1 - Python client (standard library only). MIT License (c) 2026 Park Jihoon (Tools That Don't Upload).

local = office PC runner `ttdu serve` (http://127.0.0.1:8790): files go only to this PC's runner, which runs with
        outbound network blocked - nothing leaves the PC.
hub   = TTDU hub API (https://toolsthatdontupload.com): files ARE sent to the hub (15 MB per request; only
        server-capable tools - the office presets A/B/C/HWP are refused with 422 'unsupported').
POST {base}/v1/flows/run  multipart: flow, vars, files ; header X-API-Key
  -> {ok, steps, notes, outputs: [{name, mime, size, sha256, base64}]}
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

PRESETS: dict[str, Any] = json.loads(r"""{
  "A": {
    "schema": "ttdu.flow/v1",
    "name": "증빙 사진 → PDF 한 부 (거래처_날짜)",
    "vars": [
      {
        "key": "client",
        "label": {
          "ko": "거래처",
          "en": "Client"
        }
      },
      {
        "key": "date",
        "label": {
          "ko": "날짜(YYYYMMDD)",
          "en": "Date (YYYYMMDD)"
        },
        "pattern": "^\\d{8}$",
        "default": "today"
      }
    ],
    "steps": [
      {
        "tool": "image.batch",
        "scope": "all",
        "options": {
          "auto_orient": true,
          "resize": {
            "long_edge": 1600
          },
          "format": "jpeg",
          "quality": 0.85
        },
        "onlyKind": "image",
        "op": "resize"
      },
      {
        "tool": "pdf.from_images",
        "scope": "all",
        "options": {
          "page_size": "a4",
          "orientation": "auto",
          "fit": "contain",
          "margin": 18
        },
        "onlyKind": "image",
        "op": "to_pdf"
      },
      {
        "tool": "pdf.fit_size",
        "scope": "each",
        "options": {
          "target_bytes": 1048576,
          "allow_raster": true
        },
        "onlyKind": "pdf",
        "op": "size",
        "outName": "{client}_{date}"
      }
    ],
    "expect": [
      {
        "check": "page_count",
        "value": "inputs"
      },
      {
        "check": "max_bytes",
        "value": 1048576,
        "kind": "pdf"
      },
      {
        "check": "format",
        "value": "pdf"
      },
      {
        "check": "out_name",
        "template": "{client}_{date}"
      }
    ]
  },
  "B": {
    "schema": "ttdu.flow/v1",
    "name": "급여명세서 검수 (급여대장 하나 → 4대보험·소득세 재계산)",
    "vars": [
      {
        "key": "client",
        "label": {
          "ko": "거래처",
          "en": "Client"
        }
      },
      {
        "key": "date",
        "label": {
          "ko": "날짜(YYYYMMDD)",
          "en": "Date (YYYYMMDD)"
        },
        "pattern": "^\\d{8}$",
        "default": "today"
      }
    ],
    "steps": [
      {
        "tool": "payroll.check_kr",
        "scope": "each",
        "options": {
          "tolerance": 0
        },
        "op": "payroll_check",
        "outName": "{client}_급여검수_{date}"
      }
    ],
    "expect": [
      {
        "check": "format",
        "value": "xlsx"
      },
      {
        "check": "out_name",
        "template": "{client}_급여검수_{date}"
      }
    ]
  },
  "C": {
    "schema": "ttdu.flow/v1",
    "name": "고객 서류 개인정보 가리기 (주민번호·전화·계좌)",
    "steps": [
      {
        "tool": "redact.pdf",
        "scope": "each",
        "options": {
          "terms": "@pii:rrn,phone,account",
          "term_box": "chars"
        },
        "onlyKind": "pdf",
        "op": "redact"
      },
      {
        "tool": "redact.image",
        "scope": "each",
        "options": {
          "regions": "@pii:rrn,phone,account"
        },
        "onlyKind": "image",
        "op": "redact"
      },
      {
        "tool": "meta.strip",
        "scope": "each",
        "options": {},
        "op": "strip_meta"
      }
    ],
    "expect": [
      {
        "check": "pii_absent",
        "kinds": [
          "rrn",
          "phone",
          "account"
        ]
      }
    ]
  },
  "HWP": {
    "schema": "ttdu.flow/v1",
    "name": "HWP·HWPX → PDF",
    "steps": [
      {
        "scope": "each",
        "tool": "hwp.to_pdf",
        "options": {}
      }
    ]
  },
  "HWP_TEXT": {
    "schema": "ttdu.flow/v1",
    "name": "HWP·HWPX → 텍스트",
    "steps": [
      {
        "scope": "each",
        "tool": "hwp.extract_text",
        "options": {}
      }
    ]
  }
}
""")

DEFAULT_URL = {"local": "http://127.0.0.1:8790", "hub": "https://toolsthatdontupload.com"}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "host.docker.internal"}


class TtduError(RuntimeError):
    def __init__(self, msg: str, status: int | None = None, body: Any = None):
        super().__init__(msg)
        self.status, self.body = status, body


def base_url(target: str = "local", url: str | None = None) -> str:
    return ((url or "").strip() or DEFAULT_URL["hub" if target == "hub" else "local"]).rstrip("/")


def resolve_flow(flow: Any) -> dict:
    if isinstance(flow, str) and flow in PRESETS:
        return PRESETS[flow]
    if isinstance(flow, str):
        return json.loads(flow)
    if isinstance(flow, dict):
        return flow
    raise TtduError("flow must be a preset id (%s) or ttdu.flow/v1 JSON" % ", ".join(PRESETS))


def one_step_flow(tool: str, options: dict | None = None, scope: str = "each") -> dict:
    return {"schema": "ttdu.flow/v1", "steps": [{"tool": tool, "scope": scope, "options": options or {}}]}


def _multipart(fields: dict, files: list) -> tuple:
    b = "----ttdu" + uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += ('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n' % (b, k)).encode() + v.encode("utf-8") + b"\r\n"
    for name, data in files:
        q = urllib.parse.quote(name)
        out += ('--%s\r\nContent-Disposition: form-data; name="files"; filename="%s"; filename*=UTF-8\'\'%s\r\n'
                "Content-Type: application/octet-stream\r\n\r\n" % (b, q, q)).encode() + data + b"\r\n"
    out += ("--%s--\r\n" % b).encode()
    return bytes(out), "multipart/form-data; boundary=" + b


def run_flow(flow: Any, files: list, *, api_key: str, target: str = "local", url: str | None = None,
             vars: dict | None = None, timeout: float = 600, deliver: Any = None) -> dict:
    """files: [(name, bytes)] or [path]. Returns {ok, steps, notes, deliveries, outputs:[{name,mime,size,sha256,data}]}.
    deliver: optional rules to keep the results in office systems configured on the office PC runner (connectors.json);
    local target only, receipts come back in "deliveries"."""
    base = base_url(target, url)
    if target != "hub" and urllib.parse.urlparse(base).hostname not in LOCAL_HOSTS:
        raise TtduError("local target must be this PC (127.0.0.1, localhost, host.docker.internal): " + base)
    pairs = []
    for f in files:
        if isinstance(f, str):
            with open(f, "rb") as fh:
                pairs.append((os.path.basename(f), fh.read()))
        else:
            pairs.append((f[0], f[1]))
    if not pairs:
        raise TtduError("no files given")
    fields = {"flow": json.dumps(resolve_flow(flow), ensure_ascii=False), "vars": json.dumps(vars or {}, ensure_ascii=False)}
    if deliver is not None:
        if target == "hub":
            raise TtduError("deliver (keep results in office systems) works only with the office PC runner")
        fields["deliver"] = deliver if isinstance(deliver, str) else json.dumps(deliver, ensure_ascii=False)
    body, ctype = _multipart(fields, pairs)
    req = urllib.request.Request(base + "/v1/flows/run", data=body, method="POST",
                                 headers={"Content-Type": ctype, "X-API-Key": api_key.strip()})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, text = r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode("utf-8", "replace")
    try:
        j = json.loads(text)
    except ValueError:
        j = None
    if status != 200 or not isinstance(j, dict) or j.get("ok") is not True:
        raise TtduError("TTDU run failed (HTTP %s): %s" % (status, text[:500]), status, j or text)
    outs = []
    for o in j.get("outputs", []):
        data = base64.b64decode(o["base64"])
        if hashlib.sha256(data).hexdigest() != str(o.get("sha256", "")).lower():
            raise TtduError("sha256 mismatch for " + str(o.get("name")))
        outs.append({"name": o["name"], "mime": o.get("mime"), "size": o.get("size"), "sha256": o.get("sha256"), "data": data})
    return {"ok": True, "steps": j.get("steps", []), "notes": j.get("notes", []), "deliveries": j.get("deliveries", []), "outputs": outs}
