"""Template: monthly payroll check (flow B) on the 5th, 09:00 Asia/Seoul, for every client folder /opt/ttdu/payroll/<client>/*.xlsx."""
import os
from datetime import datetime

import pendulum

try:
    from airflow.sdk import DAG
except ImportError:
    from airflow import DAG

from ttdu_provider.operators.ttdu import TtduRunFlowOperator

ROOT = os.environ.get("TTDU_PAYROLL_ROOT", "/opt/ttdu/payroll")
CLIENTS = sorted(d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d))) if os.path.isdir(ROOT) else []

with DAG("ttdu_monthly_payroll_check", start_date=pendulum.datetime(2026, 11, 1, tz="Asia/Seoul"), schedule="0 9 5 * *", catchup=False, tags=["ttdu"]) as dag:
    for c in CLIENTS:
        TtduRunFlowOperator(task_id="payroll_" + "".join(ch if ch.isalnum() else "_" for ch in c), flow="B",
                            input_paths=os.path.join(ROOT, c, "*.xlsx"), output_dir=os.path.join(ROOT, c, "checked"),
                            vars={"client": c, "date": "{{ data_interval_end.in_timezone('Asia/Seoul').strftime('%Y%m%d') }}"})
