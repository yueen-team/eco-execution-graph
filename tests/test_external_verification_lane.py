import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from external_verification_lane import (
    build_report,
    redact_text,
    resolve_ecocheck_smoke_report_path,
    summarize_ecocheck_graph_push,
    summarize_rag_report,
)


class ExternalVerificationLaneTest(unittest.TestCase):
    def test_missing_external_config_blocks_without_promotion(self):
        report = build_report(
            checked_at="2026-06-22T00:00:00Z",
            env={},
            steps=[],
            rag_report=None,
        )

        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["preflight"]["status"], "blocked")
        self.assertIn("TENCENT_LKE_SECRET_ID", report["preflight"]["missing"])
        self.assertIn("tokenhub_deepseek_api_key", report["preflight"]["missing"])
        self.assertFalse(report["promotion_decision"]["blocking_now"])
        self.assertFalse(report["promotion_decision"]["environment_scoped_blocking_candidate"])
        self.assertFalse(report["redaction_boundary"]["secret_values_recorded"])
        self.assertFalse(report["redaction_boundary"]["env_values_recorded"])

    def test_passing_rag_summary_remains_metadata_only(self):
        rag = summarize_rag_report(
            {
                "rag_real_smoke": "pass",
                "tokenhub_probe": {"status": "pass"},
                "rag_retrieve_probe": {"status": "pass"},
                "embedding_probe": {"status": "pass"},
                "citation_count": 1,
                "counts": {"resolved": 1},
                "locator_counts": {"specific": 1},
                "source_level_items": [],
                "results": [
                    {
                        "raw_cached": False,
                        "excerpt": "",
                        "cache_policy": "metadata_only",
                    }
                ],
            }
        )

        self.assertEqual(rag["status"], "pass")
        self.assertEqual(rag["safety"]["status"], "pass")
        self.assertEqual(rag["safety"]["raw_cached_true_count"], 0)
        self.assertEqual(rag["safety"]["non_empty_excerpt_count"], 0)
        self.assertFalse(rag["safety"]["raw_rag_content_stored"])

    def test_raw_content_key_fails_safety_scan(self):
        rag = summarize_rag_report(
            {
                "rag_real_smoke": "pass",
                "tokenhub_probe": {"status": "pass"},
                "rag_retrieve_probe": {"status": "pass"},
                "results": [{"raw_cached": False, "excerpt": "", "Content": "must not be cached"}],
            }
        )

        self.assertEqual(rag["status"], "failed")
        self.assertEqual(rag["safety"]["status"], "failed")
        self.assertTrue(rag["safety"]["raw_rag_content_stored"])

    def test_default_required_gate_is_only_rag(self):
        report = build_report(
            checked_at="2026-06-22T00:00:00Z",
            env={
                "TENCENT_LKE_SECRET_ID": "configured-secret-id",
                "TENCENT_LKE_SECRET_KEY": "configured-secret-key",
                "TENCENT_LKE_KNOWLEDGE_BASE_IDS": "kb-1",
                "TENCENT_TOKENHUB_API_KEY": "configured-tokenhub",
            },
            steps=[
                {"name": "rag-resolve", "command": "pnpm rag:resolve", "status": "pass", "exit_code": 0},
                {"name": "rag-real-gate", "command": "pnpm rag:real:gate", "status": "pass", "exit_code": 0},
            ],
            rag_report={
                "rag_real_smoke": "pass",
                "tokenhub_probe": {"status": "pass"},
                "rag_retrieve_probe": {"status": "pass"},
                "embedding_probe": {"status": "pass"},
                "results": [{"raw_cached": False, "excerpt": ""}],
            },
        )

        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["required_gate_ids"], ["GRAPH-RAG-REAL-SMOKE"])
        gate_statuses = {gate["gate_id"]: gate["status"] for gate in report["gates"]}
        self.assertEqual(gate_statuses["GRAPH-RAG-REAL-SMOKE"], "pass")

    def test_all_required_gates_fail_closed_when_external_inputs_are_absent(self):
        report = build_report(
            checked_at="2026-06-22T00:00:00Z",
            env={
                "GRAPH_EXTERNAL_REQUIRED_GATES": "all",
                "TENCENT_LKE_SECRET_ID": "configured-secret-id",
                "TENCENT_LKE_SECRET_KEY": "configured-secret-key",
                "TENCENT_LKE_KNOWLEDGE_BASE_IDS": "kb-1",
                "TENCENT_TOKENHUB_API_KEY": "configured-tokenhub",
            },
            steps=[
                {"name": "rag-resolve", "command": "pnpm rag:resolve", "status": "pass", "exit_code": 0},
                {"name": "rag-real-gate", "command": "pnpm rag:real:gate", "status": "pass", "exit_code": 0},
            ],
            rag_report={
                "rag_real_smoke": "pass",
                "tokenhub_probe": {"status": "pass"},
                "rag_retrieve_probe": {"status": "pass"},
                "embedding_probe": {"status": "pass"},
                "results": [{"raw_cached": False, "excerpt": ""}],
            },
        )

        self.assertEqual(report["status"], "blocked")
        self.assertIn("ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW", report["required_gate_ids"])

    def test_redact_text_scrubs_structured_secret_lines(self):
        env = {"TENCENT_LKE_SECRET_KEY": "abcdefghruntoken"}
        sample = (
            "Authorization: Bearer abcdefghruntoken trailing-after-r\n"
            "secret_key=supersecretvalue, next=keep\n"
            "api-key: rotateThisKey now\n"
            "value=abcdefghruntoken end"
        )

        redacted = redact_text(sample, env)

        # The raw env secret must never survive anywhere in the output.
        self.assertNotIn("abcdefghruntoken", redacted)
        # Structured-line redaction must consume the whole value, not stop at
        # the first 'r'/'s' (the old [^\\r\\n] / [^\\s,;}] escaping bug).
        self.assertNotIn("trailing-after-r", redacted)
        self.assertNotIn("supersecretvalue", redacted)
        self.assertNotIn("rotateThisKey", redacted)
        # Non-secret neighbours after a delimiter must be preserved.
        self.assertIn("next=keep", redacted)

    def test_ecocheck_gate_blocks_clearly_when_path_not_injected(self):
        # No machine-specific E:/EcoCheck fallback: an unconfigured environment
        # must block with an explicit required_input, not silently miss a file.
        self.assertIsNone(resolve_ecocheck_smoke_report_path({}))

        gate = summarize_ecocheck_graph_push({})
        self.assertEqual(gate["gate_id"], "ECOCHECK-GRAPH-PUSH-REAL-SMOKE")
        self.assertEqual(gate["status"], "blocked")
        self.assertIsNone(gate["report"])
        self.assertIn("ECOCHECK_ROOT", gate["required_input"])

    def test_ecocheck_path_resolves_from_injected_env(self):
        explicit = resolve_ecocheck_smoke_report_path(
            {"ECOCHECK_GRAPH_SMOKE_REPORT": "/tmp/custom-smoke.json"}
        )
        self.assertEqual(explicit.as_posix(), "/tmp/custom-smoke.json")

        from_root = resolve_ecocheck_smoke_report_path({"ECOCHECK_ROOT": "/srv/EcoCheck"})
        self.assertEqual(
            from_root.as_posix(),
            "/srv/EcoCheck/docs/validation/graph-synthetic-smoke.latest.json",
        )

    def test_report_pins_commit_and_marks_credential_binding(self):
        report = build_report(
            checked_at="2026-06-23T00:00:00Z",
            env={},
            steps=[],
            rag_report=None,
            commit={"sha": "deadbeefcafe0001", "short_sha": "deadbeefcafe", "dirty": False},
        )

        self.assertEqual(report["source_commit"]["short_sha"], "deadbeefcafe")
        self.assertFalse(report["reproducibility"]["closed_world_independent"])
        # No credentials in env -> credential binding is surfaced, not hidden.
        self.assertFalse(report["reproducibility"]["credentials_present"])
        self.assertIn("TENCENT_LKE_SECRET_ID", report["reproducibility"]["required_credential_env_names"])

    def test_report_source_commit_defaults_when_commit_absent(self):
        report = build_report(checked_at="2026-06-23T00:00:00Z", env={}, steps=[], rag_report=None)
        self.assertIsNone(report["source_commit"]["sha"])


if __name__ == "__main__":
    unittest.main()
