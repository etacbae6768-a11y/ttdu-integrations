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

with open(os.path.join(os.path.dirname(__file__), "presets.json"), encoding="utf-8") as _f:
    PRESETS: dict[str, Any] = json.load(_f)

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
             vars: dict | None = None, timeout: float = 600) -> dict:
    """files: [(name, bytes)] or [path]. Returns {ok, steps, notes, outputs:[{name,mime,size,sha256,data}]}"""
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
    body, ctype = _multipart({"flow": json.dumps(resolve_flow(flow), ensure_ascii=False),
                              "vars": json.dumps(vars or {}, ensure_ascii=False)}, pairs)
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
    return {"ok": True, "steps": j.get("steps", []), "notes": j.get("notes", []), "outputs": outs}
