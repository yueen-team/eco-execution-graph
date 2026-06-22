from __future__ import annotations

import os
from pathlib import Path

from common import EXPORTS_DIR, ROOT


TODAY = "2026-06-10"
DEFAULT_ECO_KB = Path(r"E:\eco-semantic-knowledge-base")
DEFAULT_ECO_KB_MANIFEST = DEFAULT_ECO_KB / "manifests" / "graph_kb_package_manifest_v1_0.json"
SPL = Path(r"E:\semantic-profile-lab")
UPSTREAM_DIR = ROOT / "data" / "upstream"
FULL_INTERNAL = EXPORTS_DIR / "full_internal_product_v1"
FULL_SHARED = EXPORTS_DIR / "shared_product_v1"
LINEAGE_FIXTURE = ROOT / "data" / "candidates" / "government_lineage_contract_fixture.json"
SUPPORTED_LINEAGE_EDGE_TYPES = (
    "replaced_by",
    "amended_by",
    "split_into",
    "merged_into",
    "inherits_from",
    "conflicts_with",
)


def resolve_eco_kb_manifest_path() -> Path:
    return Path(os.environ.get("ECO_KB_PACKAGE_MANIFEST", DEFAULT_ECO_KB_MANIFEST))


def resolve_eco_kb_root() -> Path:
    configured_root = os.environ.get("ECO_KB_ROOT")
    if configured_root:
        return Path(configured_root)
    manifest_path = resolve_eco_kb_manifest_path()
    if manifest_path.exists() and manifest_path.parent.name == "manifests":
        return manifest_path.parent.parent
    return DEFAULT_ECO_KB


ECO_KB_MANIFEST = resolve_eco_kb_manifest_path()
ECO_KB = resolve_eco_kb_root()
