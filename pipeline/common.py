from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
EXPORTS_DIR = DATA_DIR / "exports"
REPORTS_DIR = ROOT / "reports"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_graph_package(package_dir: Path, graph: dict[str, Any], package_name: str, tier_filter: str | None, demo_package: bool) -> dict[str, Any]:
    reset_dir(package_dir)
    graph_json = package_dir / "graph.json"
    graph_ndjson = package_dir / "graph.ndjson"
    write_json(graph_json, graph)
    with graph_ndjson.open("w", encoding="utf-8") as handle:
        for key, record_type in (("nodes", "node"), ("edges", "edge"), ("sources", "source")):
            for record in graph[key]:
                line = {"record_type": record_type, **record}
                handle.write(json.dumps(line, ensure_ascii=False) + "\n")
    manifest = {
        "package_name": package_name,
        "demo_package": demo_package,
        "tier_filter": tier_filter,
        "record_counts": {key: len(graph[key]) for key in ("nodes", "edges", "sources")},
        "files": {
            "graph.json": {"sha256": sha256_file(graph_json)},
            "graph.ndjson": {"sha256": sha256_file(graph_ndjson)},
        },
    }
    manifest_path = package_dir / "manifest.json"
    write_json(manifest_path, manifest)
    manifest["files"]["manifest.json"] = {"sha256": sha256_file(manifest_path)}
    write_json(manifest_path, manifest)
    return manifest


def load_internal_graph() -> dict[str, Any]:
    return read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
