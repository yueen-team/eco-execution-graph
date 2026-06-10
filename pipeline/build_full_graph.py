from p2p3_common import build_full_graph, export_full_packages, generate_cards, upstream_utilization_report

if __name__ == "__main__":
    result = build_full_graph()
    cards = generate_cards()
    packages = export_full_packages()
    utilization = upstream_utilization_report()
    print({"graph": result, "cards": cards, "packages": packages["shared"].get("record_counts"), "utilization": utilization["status"]})
