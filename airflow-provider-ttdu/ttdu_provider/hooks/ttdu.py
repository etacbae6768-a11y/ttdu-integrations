"""Airflow hook for TTDU. Connection type `ttdu`: host = runner/hub URL, password = API key,
extra = {"target": "local" | "hub"}. MIT License (c) 2026 Park Jihoon (Tools That Don't Upload)."""
from __future__ import annotations

from typing import Any

try:  # Airflow 3
    from airflow.sdk.bases.hook import BaseHook
except ImportError:  # Airflow 2
    from airflow.hooks.base import BaseHook

from ttdu_provider import client


class TtduHook(BaseHook):
    conn_name_attr = "ttdu_conn_id"
    default_conn_name = "ttdu_default"
    conn_type = "ttdu"
    hook_name = "TTDU"

    @classmethod
    def get_ui_field_behaviour(cls) -> dict[str, Any]:
        return {"hidden_fields": ["schema", "login", "port"],
                "relabeling": {"host": "URL (http://127.0.0.1:8790 or hub)", "password": "API key"},
                "placeholders": {"extra": '{"target": "local"}'}}

    def __init__(self, ttdu_conn_id: str = default_conn_name, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.ttdu_conn_id = ttdu_conn_id

    def _auth(self) -> dict:
        c = self.get_connection(self.ttdu_conn_id)
        extra = c.extra_dejson or {}
        url = c.host or ""
        if url and "://" not in url:
            url = "%s://%s%s" % (c.schema or "http", url, ":%s" % c.port if c.port else "")
        return {"target": extra.get("target", "local"), "url": url, "api_key": c.password or ""}

    def run_flow(self, flow: Any, files: list, vars: dict | None = None, timeout: float = 600) -> dict:
        a = self._auth()
        return client.run_flow(flow, files, api_key=a["api_key"], target=a["target"], url=a["url"], vars=vars, timeout=timeout)

    def test_connection(self) -> tuple:
        import urllib.request
        a = self._auth()
        try:
            req = urllib.request.Request(client.base_url(a["target"], a["url"]) + "/v1/health", headers={"X-API-Key": a["api_key"]})
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200, "HTTP %s" % r.status
        except Exception as e:  # noqa: BLE001
            return False, str(e)
