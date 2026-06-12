from __future__ import annotations

import hashlib
import json
import re
from typing import Any


ARTICLE_RE = re.compile(r"第[一二三四五六七八九十百千万零〇两\d]+条(?:之[一二三四五六七八九十\d]+)?")
TECH_SPEC_RE = re.compile(
    r"\b(?:GB|GB/T|HJ|HJ/T|DB\d{2}|DB\d{2}/T|T/[A-Z0-9]+)\s*[0-9][0-9A-Za-z./-]*(?:[-—][0-9]{2,4})?\b",
    re.IGNORECASE,
)
UNRESOLVED_SPEC_MARKERS = {"STANDARD_NO_PENDING_FROM_TITLE_OR_FRONTMATTER", "PENDING", "UNKNOWN", "N/A"}


ALIASES = {
    "rag_doc_ref": ("rag_doc_ref", "RagDocRef", "DocumentId", "DocId", "KnowledgeId", "FileId", "SourceId"),
    "node_id": ("node_id", "NodeId", "NodeID", "GraphNodeId"),
    "node_type": ("node_type", "NodeType", "Type", "ResultSource"),
    "law_name": ("law_name", "LawName", "LawTitle", "StandardName", "DocName", "Title", "title"),
    "article_no": ("article_no", "ArticleNo", "ArticleNumber", "Article", "LawArticle", "条款号", "条文号"),
    "tech_spec_no": ("tech_spec_no", "standard_no", "StandardNo", "TechSpecNo", "SpecNo", "规范编号", "标准号"),
    "citation_title": ("citation_title", "CitationTitle", "Title", "title", "DocName"),
    "citation_locator": ("citation_locator", "CitationLocator", "Locator", "Location", "ChunkId", "SegmentId"),
    "page": ("page", "Page", "PageNumber", "PageNumbers", "ChunkPageNumbers", "Pages", "页码"),
    "section": ("section", "Section", "SectionTitle", "Heading", "Chapter", "ChunkSection", "章节", "小节"),
    "source_hash": ("source_hash", "SourceHash", "DocHash", "Hash", "ContentHash"),
}


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return " ".join(_as_text(item) for item in value if _as_text(item)).strip()
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value).strip()


def _metadata(record: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    metadata = record.get("Metadata") or record.get("metadata") or {}
    return metadata if isinstance(metadata, dict) else {}


def _lookup(record: dict[str, Any] | None, aliases: tuple[str, ...]) -> Any:
    if not isinstance(record, dict):
        return None
    metadata = _metadata(record)
    for key in aliases:
        if key in record and record[key] not in (None, ""):
            return record[key]
        if key in metadata and metadata[key] not in (None, ""):
            return metadata[key]
    return None


def _first_regex(pattern: re.Pattern[str], *values: Any) -> str:
    for value in values:
        text = _as_text(value)
        match = pattern.search(text)
        if match:
            return match.group(0).replace("—", "-").strip()
    return ""


def _normalize_pages(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, list):
        pages = [str(item).strip() for item in value if str(item).strip()]
        if not pages:
            return ""
        if len(pages) == 1:
            return f"第{pages[0]}页"
        return f"第{pages[0]}-{pages[-1]}页"
    text = _as_text(value)
    if not text:
        return ""
    if text.startswith("第") and text.endswith("页"):
        return text
    return f"第{text}页" if text.isdigit() else text


def _stable_hash(record: dict[str, Any] | None) -> str:
    if not isinstance(record, dict):
        return ""
    payload = {
        "Title": record.get("Title") or record.get("title"),
        "Metadata": _metadata(record),
    }
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sanitize_retrieve_record(record: dict[str, Any], knowledge_base_id_suffix: str = "") -> dict[str, Any]:
    """Keep only citation-safe metadata from RetrieveKnowledge records."""
    metadata = _metadata(record)
    return {
        "knowledge_base_id_suffix": knowledge_base_id_suffix,
        "title": record.get("Title") or record.get("title"),
        "metadata": metadata,
        "record_keys": sorted(record.keys()),
        "metadata_keys": sorted(metadata.keys()),
    }


def infer_article_no(record: dict[str, Any] | None, node_attrs: dict[str, Any], title: str) -> str:
    explicit = _as_text(_lookup(record, ALIASES["article_no"]) or node_attrs.get("article_no"))
    return explicit or _first_regex(ARTICLE_RE, title, _metadata(record), record)


def infer_tech_spec_no(record: dict[str, Any] | None, node_attrs: dict[str, Any], title: str) -> str:
    explicit = _as_text(
        _lookup(record, ALIASES["tech_spec_no"])
        or node_attrs.get("standard_no")
        or node_attrs.get("tech_spec_no")
    )
    if explicit and explicit.upper() not in UNRESOLVED_SPEC_MARKERS:
        return explicit.replace("—", "-")
    return _first_regex(TECH_SPEC_RE, title, _metadata(record), record)


def build_citation_locator(
    record: dict[str, Any] | None,
    *,
    article_no: str,
    tech_spec_no: str,
) -> tuple[str, str]:
    explicit = _as_text(_lookup(record, ALIASES["citation_locator"]))
    if explicit and explicit != "source-level":
        return explicit, "metadata_locator"

    page = _normalize_pages(_lookup(record, ALIASES["page"]))
    section = _as_text(_lookup(record, ALIASES["section"]))
    parts = [part for part in (article_no, tech_spec_no, section, page) if part]
    if parts:
        level = "article" if article_no else "spec_or_section"
        if page:
            level += "_page"
        return "；".join(parts), level
    return "source-level", "missing_article_spec_page_section_metadata"


def select_citation_metadata_record(
    node: dict[str, Any],
    metadata_records: list[dict[str, Any]],
) -> dict[str, Any] | None:
    attrs = node.get("attrs", {}) if isinstance(node.get("attrs"), dict) else {}
    node_id = node.get("node_id")
    rag_doc_ref = attrs.get("rag_doc_ref")
    article_no = attrs.get("article_no")
    spec_no = attrs.get("standard_no") or attrs.get("tech_spec_no")
    node_name = _as_text(node.get("name"))

    for record in metadata_records:
        metadata = _metadata(record)
        text = " ".join(_as_text(value) for value in (record.get("title"), record.get("Title"), metadata))
        if node_id and node_id in text:
            return record
        if rag_doc_ref and rag_doc_ref in text:
            return record
        if article_no and article_no in text:
            return record
        if spec_no and _as_text(spec_no).replace("—", "-") in text.replace("—", "-"):
            return record
        if node_name and node_name in text:
            return record
    return None


def build_citation_resolution_record(
    node: dict[str, Any],
    *,
    rag_record: dict[str, Any] | None,
    retrieve_status: str,
    resolved_at: str,
) -> dict[str, Any]:
    attrs = node.get("attrs", {}) if isinstance(node.get("attrs"), dict) else {}
    status = "resolved" if retrieve_status == "pass" else "blocked"
    manual = bool(node.get("source_ref") or attrs.get("source_basis"))
    report_usage = (
        "rag_metadata_only"
        if status == "resolved"
        else "manual_upstream_basis_only"
        if manual
        else "do_not_write_as_legal_basis"
    )

    title = _as_text(
        _lookup(rag_record, ALIASES["citation_title"])
        or _lookup(rag_record, ALIASES["law_name"])
        or node.get("name")
    )
    article_no = infer_article_no(rag_record, attrs, title) or None
    tech_spec_no = infer_tech_spec_no(rag_record, attrs, title) or None
    locator, locator_level = build_citation_locator(
        rag_record,
        article_no=article_no or "",
        tech_spec_no=tech_spec_no or "",
    )
    source_hash = _as_text(_lookup(rag_record, ALIASES["source_hash"]) or node.get("origin_hash") or _stable_hash(rag_record))

    return {
        "status": status,
        "provider": "tencent_lke_rag",
        "rag_doc_ref": _as_text(_lookup(rag_record, ALIASES["rag_doc_ref"]) or attrs.get("rag_doc_ref") or node.get("source_ref") or node["node_id"]),
        "node_id": _as_text(_lookup(rag_record, ALIASES["node_id"]) or node["node_id"]),
        "node_type": _as_text(_lookup(rag_record, ALIASES["node_type"]) or node["node_type"]),
        "law_name": _as_text(_lookup(rag_record, ALIASES["law_name"]) or attrs.get("law_name") or node.get("name")),
        "article_no": article_no,
        "tech_spec_no": tech_spec_no,
        "citation_title": title,
        "citation_locator": locator,
        "locator_level": locator_level,
        "source_level_reason": locator_level if locator == "source-level" else None,
        "excerpt": "",
        "source_hash": source_hash,
        "resolved_at": resolved_at,
        "raw_cached": False,
        "cache_policy": "metadata_only",
        "retrieval_probe": "RetrieveKnowledge",
        "report_usage_policy": report_usage,
    }


def summarize_source_level_items(results: list[dict[str, Any]]) -> list[dict[str, str]]:
    summary = []
    for item in results:
        if item.get("citation_locator") != "source-level":
            continue
        summary.append({
            "node_id": item.get("node_id", ""),
            "citation_title": item.get("citation_title", ""),
            "reason": item.get("source_level_reason") or "locator metadata missing",
        })
    return summary


def main() -> None:
    from p2p3_common import rag_resolve

    print(rag_resolve())


if __name__ == "__main__":
    main()
