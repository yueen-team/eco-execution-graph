from __future__ import annotations

import argparse

from p2p3_common import lineage_contract

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate government law lineage exchange contract.")
    parser.add_argument("--input", help="Optional lineage exchange JSON file. Defaults to contract fixture.")
    args = parser.parse_args()
    print(lineage_contract(args.input))
