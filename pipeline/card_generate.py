import argparse

from p2p3_common import generate_cards

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", default="full")
    parser.parse_args()
    print(generate_cards())
