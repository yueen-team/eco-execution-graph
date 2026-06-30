import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from external_verification_lane import (
    REQUIRED_ENV,
    build_preflight,
    build_report,
    redact_text,
    resolve_ecocheck_smoke_report_path,
    summarize_copilot_llm_smoke,
    summarize_ecocheck_graph_push,
    summarize_rag_report,
)


TOKENHUB_ONLY_ENV = {"TENCENT_TOKENHUB_API_KEY": "configured-tokenhub"}
LKE_PLUS_TOKENHUB_ENV = {
    "TENCENT_LKE_SECRET_ID": "configured-secret-id",
    "TENCENT_LKE_SECRET_KEY": "configured-secret-key",
    "TENCENT_LKE_KNOWLEDGE_BASE_IDS": "kb-1",
    "TENCENT_TOKENHUB_API_KEY": "configured-tokenhub",
}


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


class CopilotRagGroundingGateTest(unittest.TestCase):
    """副驾 RAG grounding 分域门(M2):LKE 永不阻塞,TokenHub 仍是唯一硬要件,
    LKE 在场即要求 grounded=true,缺 LKE 合法降级。"""

    def test_grounding_surface_exposes_names_only_never_values(self):
        # 守 ADR-0012:grounding_env_names 只列环境变量名,绝不暴露 LKE 凭证值。
        gate = summarize_copilot_llm_smoke(LKE_PLUS_TOKENHUB_ENV, {"status": "pass", "grounded": True})
        self.assertEqual(gate["grounding_env_names"], list(REQUIRED_ENV))
        for name in REQUIRED_ENV:
            self.assertIn(name, gate["grounding_env_names"])
        # 实际凭证值绝不出现在 surface 的任何字段里。
        flattened = repr(gate)
        for secret in ("configured-secret-id", "configured-secret-key", "kb-1", "configured-tokenhub"):
            self.assertNotIn(secret, flattened)

    def test_lke_present_and_grounded_true_passes(self):
        gate = summarize_copilot_llm_smoke(LKE_PLUS_TOKENHUB_ENV, {"status": "pass", "grounded": True})
        self.assertEqual(gate["status"], "pass")
        self.assertTrue(gate["grounding_configured"])
        self.assertTrue(gate["grounded"])
        self.assertEqual(gate["grounding"], "grounded")
        self.assertIsNone(gate["reason"])

    def test_lke_present_but_not_grounded_is_failed_regression(self):
        # grounding 回归:凭证在但报告未 grounded → failed(非 blocked),即便 smoke 自身 pass。
        gate = summarize_copilot_llm_smoke(LKE_PLUS_TOKENHUB_ENV, {"status": "pass"})
        self.assertEqual(gate["status"], "failed")
        self.assertEqual(gate["grounding"], "regression_lke_present_not_grounded")
        self.assertTrue(gate["grounding_configured"])
        self.assertIsNone(gate["grounded"])
        self.assertIn("grounding regression", gate["reason"])

    def test_lke_present_grounded_false_is_failed_regression(self):
        gate = summarize_copilot_llm_smoke(LKE_PLUS_TOKENHUB_ENV, {"status": "pass", "grounded": False})
        self.assertEqual(gate["status"], "failed")
        self.assertEqual(gate["grounding"], "regression_lke_present_not_grounded")

    def test_no_lke_degrades_without_failing(self):
        # 无 LKE 凭证:grounding 合法降级,smoke pass 仍 pass(TokenHub 唯一 pass 要件)。
        gate = summarize_copilot_llm_smoke(TOKENHUB_ONLY_ENV, {"status": "pass"})
        self.assertEqual(gate["status"], "pass")
        self.assertFalse(gate["grounding_configured"])
        self.assertIsNone(gate["grounded"])
        self.assertEqual(gate["grounding"], "degraded_no_lke_creds")
        self.assertIsNone(gate["reason"])

    def test_no_tokenhub_blocks_regardless_of_lke(self):
        # TokenHub 缺失 → blocked(配置缺口),即便 LKE 在场;LKE 永不能替代 TokenHub。
        gate = summarize_copilot_llm_smoke(
            {
                "TENCENT_LKE_SECRET_ID": "configured-secret-id",
                "TENCENT_LKE_SECRET_KEY": "configured-secret-key",
                "TENCENT_LKE_KNOWLEDGE_BASE_IDS": "kb-1",
            },
            None,
        )
        self.assertEqual(gate["status"], "blocked")
        self.assertTrue(gate["grounding_configured"])

    def test_grounding_regression_never_promotes_lke_to_required_default(self):
        # LKE 永不进 DEFAULT_REQUIRED_GATE_IDS:即便 copilot gate 因 grounding 回归 failed,
        # 默认 lane(只要求 GRAPH-RAG-REAL-SMOKE)仍按 RAG gate 判级,不被 copilot 拖红。
        report = build_report(
            checked_at="2026-06-22T00:00:00Z",
            env=LKE_PLUS_TOKENHUB_ENV,
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
            copilot_report={"status": "pass"},  # LKE 在场但未 grounded → copilot gate failed
        )
        self.assertEqual(report["required_gate_ids"], ["GRAPH-RAG-REAL-SMOKE"])
        gate_statuses = {gate["gate_id"]: gate["status"] for gate in report["gates"]}
        self.assertEqual(gate_statuses["ETO-REVIEW-COPILOT-LLM-SMOKE"], "failed")
        # 默认 lane 不要求 copilot gate → 整体仍 pass(LKE/copilot 永不阻塞默认 lane)。
        self.assertEqual(report["status"], "pass")

    def test_preflight_records_lke_grounding_without_blocking(self):
        # build_preflight 增可选 lke_rag_grounding 组:记录就绪但不进 missing(LKE 永不阻塞)。
        preflight = build_preflight(TOKENHUB_ONLY_ENV)
        groups = {alt["group"]: alt for alt in preflight["alternatives"]}
        self.assertIn("lke_rag_grounding", groups)
        self.assertFalse(groups["lke_rag_grounding"]["configured"])
        self.assertFalse(groups["lke_rag_grounding"]["blocking"])
        self.assertEqual(groups["lke_rag_grounding"]["accepted_env_names"], list(REQUIRED_ENV))
        # LKE 缺失只通过既有 RAG required 项进 missing,lke_rag_grounding 组本身从不向 missing 添加额外项。
        self.assertNotIn("lke_rag_grounding", preflight["missing"])

    def test_preflight_lke_grounding_configured_when_all_three_present(self):
        preflight = build_preflight(LKE_PLUS_TOKENHUB_ENV)
        groups = {alt["group"]: alt for alt in preflight["alternatives"]}
        self.assertTrue(groups["lke_rag_grounding"]["configured"])
        self.assertEqual(
            sorted(groups["lke_rag_grounding"]["configured_env_names"]),
            sorted(REQUIRED_ENV),
        )


if __name__ == "__main__":
    unittest.main()
