from pathlib import Path

from common import ROOT

CACHE_DIR = ROOT / ".cache" / "tencent-rag"

def cache_status() -> dict:
    return {"cache_dir": str(CACHE_DIR), "policy": "local_gitignored", "exists": CACHE_DIR.exists()}

if __name__ == "__main__":
    print(cache_status())
