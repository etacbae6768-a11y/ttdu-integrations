"""TTDU provider for Apache Airflow (unofficial; not an Apache Software Foundation project). MIT License (c) 2026 Park Jihoon (Tools That Don't Upload)."""
__version__ = "0.1.0"


def get_provider_info():
    return {
        "package-name": "airflow-provider-ttdu",
        "name": "TTDU",
        "description": "Run TTDU document flows (PDF, redaction, payroll check, HWP to PDF) on the office PC runner or the TTDU hub.",
        "versions": [__version__],
        "connection-types": [{"connection-type": "ttdu", "hook-class-name": "ttdu_provider.hooks.ttdu.TtduHook"}],
    }
