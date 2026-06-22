from __future__ import annotations

import json
import sys

from common import REPORTS_DIR, read_json


def main() -> None:
    report_path = REPORTS_DIR / "rag-citation-resolution-report.json"
    report = read_json(report_path)
    summary = {
        "rag_real_smoke": report.get("rag_real_smoke"),
        "tokenhub_probe": report.get("tokenhub_probe", {}).get("status"),
        "rag_retrieve_probe": report.get("rag_retrieve_probe", {}).get("status"),
        "report": str(report_path),
    }
    print(json.dumps(summary, ensure_ascii=False))
    if summary["rag_real_smoke"] != "pass":
        sys.exit(1)


if __name__ == "__main__":
    main()
