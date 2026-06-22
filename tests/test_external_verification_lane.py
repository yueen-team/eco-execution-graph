import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from external_verification_lane import build_report, summarize_rag_report


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


if __name__ == "__main__":
    unittest.main()
