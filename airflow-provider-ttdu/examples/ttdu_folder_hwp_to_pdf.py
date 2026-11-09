"""Template: wait for HWP/HWPX files in a folder, convert each batch to PDF on the office PC runner (files stay on the PC)."""
from datetime import datetime, timedelta

try:
    from airflow.sdk import DAG
except ImportError:
    from airflow import DAG
try:
    from airflow.providers.standard.sensors.filesystem import FileSensor
except ImportError:
    from airflow.sensors.filesystem import FileSensor

from ttdu_provider.operators.ttdu import TtduRunFlowOperator

with DAG("ttdu_folder_hwp_to_pdf", start_date=datetime(2026, 11, 1), schedule=timedelta(minutes=10), catchup=False, max_active_runs=1, tags=["ttdu"]) as dag:
    wait = FileSensor(task_id="wait_for_hwp", fs_conn_id="fs_default", filepath="/opt/ttdu/in-hwp/*.hwp*", poke_interval=30, timeout=540, mode="reschedule", soft_fail=True)
    convert = TtduRunFlowOperator(task_id="hwp_to_pdf", flow="HWP", input_paths="/opt/ttdu/in-hwp/*.hwp*", output_dir="/opt/ttdu/out-pdf/{{ ds_nodash }}")
    wait >> convert
