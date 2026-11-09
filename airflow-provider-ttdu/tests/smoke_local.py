"""Smoke test against a local runner: TTDU_URL, TTDU_API_KEY, TTDU_DEMO_DIR (folder with C-redact/input/)."""
import hashlib, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ttdu_provider import client
D = os.path.join(os.environ.get("TTDU_DEMO_DIR", "samples"), "C-redact", "input")
r = client.run_flow("C", [os.path.join(D, "client-form.pdf"), os.path.join(D, "client-scan.png")], api_key=os.environ["TTDU_API_KEY"], url=os.environ.get("TTDU_URL", "http://127.0.0.1:8790"))
print([(o["name"], o["size"], hashlib.sha256(o["data"]).hexdigest()[:12]) for o in r["outputs"]])
