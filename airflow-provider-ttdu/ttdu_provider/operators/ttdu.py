"""Airflow operator: run a TTDU flow on files from disk and write the results to a folder. MIT License (c) 2026 Park Jihoon (Tools That Don't Upload)."""
from __future__ import annotations

import glob
import os
from typing import Any, Sequence

try:  # Airflow 3
    from airflow.sdk import BaseOperator
except ImportError:  # Airflow 2
    from airflow.models import BaseOperator

from ttdu_provider.hooks.ttdu import TtduHook


class TtduRunFlowOperator(BaseOperator):
    """flow: preset id (A, B, C, HWP, HWP_TEXT) or ttdu.flow/v1 dict/JSON.
    input_paths: files or glob patterns. output_dir: where result files are written.
    Returns (XCom) {ok, count, notes, files: [{name, size, sha256, path}]} - the file bytes are not put in XCom."""

    template_fields: Sequence[str] = ("flow", "input_paths", "output_dir", "vars")

    def __init__(self, *, flow: Any, input_paths: Any, output_dir: str, vars: dict | None = None,
                 ttdu_conn_id: str = TtduHook.default_conn_name, timeout: float = 600, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.flow, self.input_paths, self.output_dir, self.vars = flow, input_paths, output_dir, vars or {}
        self.ttdu_conn_id, self.timeout = ttdu_conn_id, timeout

    def execute(self, context: Any) -> dict:
        pats = [self.input_paths] if isinstance(self.input_paths, str) else list(self.input_paths)
        files: list = []
        for p in pats:
            files += sorted(glob.glob(p)) or ([p] if os.path.isfile(p) else [])
        if not files:
            raise ValueError("no input files match %r" % pats)
        r = TtduHook(ttdu_conn_id=self.ttdu_conn_id).run_flow(self.flow, files, vars=self.vars, timeout=self.timeout)
        os.makedirs(self.output_dir, exist_ok=True)
        out = []
        for o in r["outputs"]:
            path = os.path.join(self.output_dir, o["name"])
            with open(path, "wb") as fh:
                fh.write(o["data"])
            out.append({"name": o["name"], "size": o["size"], "sha256": o["sha256"], "path": path})
            self.log.info("TTDU result %s %s bytes sha256 %s", o["name"], o["size"], o["sha256"])
        return {"ok": True, "count": len(out), "notes": r["notes"], "files": out}
