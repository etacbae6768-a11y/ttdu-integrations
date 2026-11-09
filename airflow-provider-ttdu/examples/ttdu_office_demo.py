"""TTDU office demo DAG: A receipts -> PDF, B payroll check, C redaction, HWP -> PDF (one task each).
Connection `ttdu_default`: host http://host.docker.internal:8790 (or 127.0.0.1), password = local-api-key.txt, extra {"target": "local"}."""
import os
from datetime import datetime

try:
    from airflow.sdk import DAG
except ImportError:
    from airflow import DAG

from ttdu_provider.operators.ttdu import TtduRunFlowOperator

IN = os.environ.get("TTDU_DEMO_IN", "/opt/ttdu/in")
OUT = os.environ.get("TTDU_DEMO_OUT", "/opt/ttdu/out")

with DAG("ttdu_office_demo", start_date=datetime(2026, 11, 1), schedule=None, catchup=False, tags=["ttdu"]) as dag:
    a = TtduRunFlowOperator(task_id="A_receipts_to_pdf", flow="A", input_paths=IN + "/A/*", output_dir=OUT + "/A", vars={"client": "가나다상회", "date": "20261106"})
    b = TtduRunFlowOperator(task_id="B_payroll_check", flow="B", input_paths=IN + "/B/*.xlsx", output_dir=OUT + "/B", vars={"client": "가상고객사", "date": "20261106"})
    c = TtduRunFlowOperator(task_id="C_redact", flow="C", input_paths=[IN + "/C/client-form.pdf", IN + "/C/client-scan.png"], output_dir=OUT + "/C")
    h = TtduRunFlowOperator(task_id="HWP_to_pdf", flow="HWP", input_paths=IN + "/HWP/*.hwp*", output_dir=OUT + "/HWP")
    a >> b >> c >> h
