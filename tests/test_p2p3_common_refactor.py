import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from p2p3_common import (  # noqa: E402
    ECO_KB,
    ETO_REVIEW_OVERRIDES,
    confidence_value,
    load_eto_review_overrides,
    resolve_eco_kb_root,
    source_record,
)
from p2p3_graph_records import confidence_value as direct_confidence_value  # noqa: E402
from p2p3_graph_records import source_record as direct_source_record  # noqa: E402
from p2p3_review_overrides import load_eto_review_overrides as direct_load_eto_review_overrides  # noqa: E402


class P2P3CommonRefactorTest(unittest.TestCase):
    def test_facade_still_exports_review_override_loader(self):
        self.assertEqual(load_eto_review_overrides(), direct_load_eto_review_overrides())
        self.assertEqual(ETO_REVIEW_OVERRIDES, direct_load_eto_review_overrides())
        self.assertGreaterEqual(len(ETO_REVIEW_OVERRIDES), 31)
        self.assertIn("card:full:0003", ETO_REVIEW_OVERRIDES)

    def test_facade_record_helpers_match_split_modules(self):
        self.assertIs(confidence_value, direct_confidence_value)
        self.assertIs(source_record, direct_source_record)
        self.assertEqual(confidence_value("HIGH"), 0.86)
        self.assertEqual(source_record("src:test", "approved_baseline", "shared", "doc", "ETO")["source_id"], "src:test")

    def test_facade_path_helpers_remain_compatible(self):
        self.assertEqual(ECO_KB, resolve_eco_kb_root())
