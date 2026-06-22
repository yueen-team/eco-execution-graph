import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from graph_schema_gate import load_graph_schemas, validate_graph_payload  # noqa: E402
from schema_validation import validate_against_schema  # noqa: E402


class GraphSchemaGateTest(unittest.TestCase):
    def test_validate_against_schema_reports_enum_and_min_length(self):
        issues = validate_against_schema("", {"type": "string", "minLength": 3, "enum": ["valid"]})

        messages = [issue["message"] for issue in issues]
        self.assertTrue(any("minLength" in message for message in messages))
        self.assertTrue(any("not in enum" in message for message in messages))

    def test_bad_graph_node_fails_blocking_validation(self):
        schemas = load_graph_schemas()
        graph = {
            "nodes": [{"node_id": "x", "node_type": "unknown", "name": "", "tier": "shared"}],
            "edges": [],
            "sources": [],
        }

        findings = validate_graph_payload(graph, schemas, "negative-fixture")

        self.assertTrue(any(item["severity"] == "red" and item["check_id"] == "GRAPH-SCHEMA-NODE" for item in findings))

    def test_regulated_edge_requires_legal_basis_status(self):
        schemas = load_graph_schemas()
        graph = {
            "nodes": [],
            "sources": [],
            "edges": [
                {
                    "edge_id": "edge:test:regulated",
                    "from": "law:test",
                    "to": "issue:test",
                    "edge_type": "regulated_by",
                    "tier": "shared",
                    "confidence": 0.8,
                    "confidence_reason": ["MANUAL_REVIEWED"],
                    "evidence_count": 1,
                    "last_verified_at": "2026-06-22",
                    "reviewer_role": "ETO",
                    "staleness_risk": "low",
                    "source_ref": "src:test",
                    "review_status": "HUMAN_REVIEWED",
                }
            ],
        }

        findings = validate_graph_payload(graph, schemas, "negative-fixture")

        self.assertTrue(any("legal_basis_status" in item["path"] for item in findings))
