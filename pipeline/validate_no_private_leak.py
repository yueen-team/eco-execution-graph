from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from common import EXPORTS_DIR, REPORTS_DIR, read_json, write_json, write_text
from p2p3_common import validate_full_leak
from tier_policy import nested_private_violations, structural_shared_violations

PRIVATE_TEXT_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r'"tier"\s*:\s*"private"',
        r"真实企业",
        r"客户",
        r"evidence_judgment_standard",
        r"rectification_template:hw:",
        r"report_expression:hw:",
        r"pitfall:instance",
        r"distill_event",
    ]
]


def check_package(package_dir: Path) -> list[dict]:
    violations: list[dict] = []
    graph_path = package_dir / "graph.json"
    if not graph_path.exists():
        return [{"type": "missing_graph", "path": str(graph_path)}]
    graph = read_json(graph_path)
    violations.extend(structural_shared_violations(graph))
    violations.extend(nested_private_violations(graph))
    for file_path in package_dir.rglob("*"):
        if file_path.is_file() and file_path.suffix in {".json", ".ndjson", ".md"}:
            text = file_path.read_text(encoding="utf-8")
            for pattern in PRIVATE_TEXT_PATTERNS:
                if pattern.search(text):
                    violations.append({"type": "forbidden_text_pattern", "path": str(file_path), "pattern": pattern.pattern})
    return violations


def main() -> None:
    if "--scope" in sys.argv and "full" in sys.argv:
        result = validate_full_leak()
        print(json.dumps(result, ensure_ascii=False))
        if result["violations"]:
            sys.exit(1)
        return
    packages = [path for path in EXPORTS_DIR.glob("*shared*") if path.is_dir()]
    violations: list[dict] = []
    for package in packages:
        violations.extend(check_package(package))
    result = {"status": "pass" if not violations else "failed", "checked_packages": [str(p) for p in packages], "violations": violations}
    write_json(REPORTS_DIR / "private-leak-check.json", result)
    lines = ["# Private Leak Check", "", f"- status: `{result['status']}`", f"- checked_packages: {len(packages)}", f"- violations: {len(violations)}"]
    for violation in violations:
        lines.append(f"- {violation}")
    write_text(REPORTS_DIR / "private-leak-check.md", "\n".join(lines))
    print(json.dumps(result, ensure_ascii=False))
    if violations:
        sys.exit(1)


if __name__ == "__main__":
    main()
