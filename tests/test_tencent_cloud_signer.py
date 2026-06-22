import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from tencent_cloud_signer import load_env


class TencentCloudSignerTest(unittest.TestCase):
    def test_runtime_tencent_env_overrides_local_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_path = Path(temp_dir) / ".env.local"
            env_path.write_text(
                "TENCENT_LKE_SECRET_ID=old-local-id\n"
                "TENCENT_LKE_SECRET_KEY=old-local-key\n"
                "TENCENT_LKE_REGION=ap-guangzhou\n",
                encoding="utf-8",
            )

            with patch.dict(
                os.environ,
                {
                    "TENCENT_LKE_SECRET_ID": "runtime-id",
                    "TENCENT_LKE_SECRET_KEY": "runtime-key",
                },
                clear=False,
            ):
                env = load_env(env_path)

        self.assertEqual(env["TENCENT_LKE_SECRET_ID"], "runtime-id")
        self.assertEqual(env["TENCENT_LKE_SECRET_KEY"], "runtime-key")
        self.assertEqual(env["TENCENT_LKE_REGION"], "ap-guangzhou")


if __name__ == "__main__":
    unittest.main()
