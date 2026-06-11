from __future__ import annotations

from typing import Any


FORBIDDEN_SHARED_NODE_TYPES = {
    "enterprise",
    "facility",
    "discharge_outlet",
    "risk_unit",
    "issue_instance",
    "pitfall_instance",
    "evidence_judgment_standard",
    "evidence_instance",
    "rectification_template",
    "rectification_instance",
    "report_expression",
    "distill_event",
}

UNSAFE_LEGAL_BASIS_STATUSES = {"candidate", "disputed"}


def is_shared_node(node: dict[str, Any]) -> bool:
    return node.get("tier") == "shared" and node.get("node_type") not in FORBIDDEN_SHARED_NODE_TYPES


def is_shared_source(source: dict[str, Any]) -> bool:
    return source.get("tier") == "shared"


def is_shared_edge(edge: dict[str, Any], node_ids: set[str], source_ids: set[str]) -> bool:
    if edge.get("tier") != "shared":
        return False
    if edge.get("from") not in node_ids or edge.get("to") not in node_ids:
        return False
    if edge.get("source_ref") not in source_ids:
        return False
    if edge.get("legal_basis_status") in UNSAFE_LEGAL_BASIS_STATUSES:
        return False
    return True


def filter_shared_graph(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = [node for node in graph.get("nodes", []) if is_shared_node(node)]
    node_ids = {node["node_id"] for node in nodes}
    source_by_id = {
        source["source_id"]: source for source in graph.get("sources", []) if is_shared_source(source)
    }
    edges = [
        edge
        for edge in graph.get("edges", [])
        if is_shared_edge(edge, node_ids, set(source_by_id))
    ]
    used_sources = {edge["source_ref"] for edge in edges}
    return {
        "nodes": nodes,
        "edges": edges,
        "sources": [source for sid, source in source_by_id.items() if sid in used_sources],
    }


def structural_shared_violations(graph: dict[str, Any]) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    node_ids = {node.get("node_id") for node in graph.get("nodes", [])}
    source_ids = {source.get("source_id") for source in graph.get("sources", [])}
    for node in graph.get("nodes", []):
        node_id = node.get("node_id")
        if node.get("tier") != "shared":
            violations.append({"type": "non_shared_node", "id": node_id, "tier": node.get("tier")})
        if node.get("node_type") in FORBIDDEN_SHARED_NODE_TYPES:
            violations.append({"type": "forbidden_node_type", "id": node_id, "node_type": node.get("node_type")})
    for source in graph.get("sources", []):
        if source.get("tier") != "shared":
            violations.append({"type": "non_shared_source", "id": source.get("source_id"), "tier": source.get("tier")})
    for edge in graph.get("edges", []):
        edge_id = edge.get("edge_id")
        if edge.get("tier") != "shared":
            violations.append({"type": "non_shared_edge", "id": edge_id, "tier": edge.get("tier")})
        if edge.get("from") not in node_ids or edge.get("to") not in node_ids:
            violations.append({"type": "edge_endpoint_not_exported", "id": edge_id})
        if edge.get("source_ref") not in source_ids:
            violations.append({"type": "edge_source_not_exported", "id": edge_id})
        if edge.get("legal_basis_status") in UNSAFE_LEGAL_BASIS_STATUSES:
            violations.append(
                {
                    "type": "unsafe_legal_basis",
                    "id": edge_id,
                    "legal_basis_status": edge.get("legal_basis_status"),
                }
            )
    return violations


def nested_private_violations(value: Any, path: str = "$") -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if value.get("tier") == "private":
            violations.append({"type": "nested_private_tier", "path": path})
        if value.get("node_type") in FORBIDDEN_SHARED_NODE_TYPES:
            violations.append(
                {"type": "nested_forbidden_node_type", "path": path, "node_type": value.get("node_type")}
            )
        for key, item in value.items():
            violations.extend(nested_private_violations(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            violations.extend(nested_private_violations(item, f"{path}[{index}]"))
    return violations
