from __future__ import annotations

from pathlib import Path
from typing import Any

from common import sha256_file
from p2p3_io import rel, run_git


def upstream_repo_info(path: Path, name: str) -> dict[str, Any]:
    if not path.exists():
        return {"name": name, "local_path": str(path), "status": "blocked", "reason": "local path missing"}
    remotes = run_git(path, "remote", "-v")
    return {
        "name": name,
        "local_path": str(path),
        "status": "pass",
        "branch": run_git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        "commit": run_git(path, "rev-parse", "HEAD"),
        "remote": remotes.splitlines()[0] if remotes else "",
    }


def collect_upstream_assets(repos: list[dict[str, Any]], patterns: tuple[str, ...]) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    for repo in repos:
        base = Path(repo["local_path"])
        if repo["status"] != "pass":
            continue
        for pattern in patterns:
            for path in base.glob(pattern):
                assets.append({
                    "repo": repo["name"],
                    "path": rel(path, base),
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                })
    return assets
