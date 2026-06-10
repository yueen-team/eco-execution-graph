from __future__ import annotations

import argparse
import json
import sys

from tencent_cloud_signer import TencentCloudClient, TencentCloudError, load_env


def probe_embedding(client: TencentCloudClient) -> dict:
    response = client.call(
        service="lkeap",
        host="lkeap.tencentcloudapi.com",
        action="GetEmbedding",
        version="2024-05-22",
        payload={
            "Model": "lke-text-embedding-v1",
            "Inputs": ["ping"],
            "TextType": "query",
            "Instruction": "query:",
        },
        region="ap-guangzhou",
    )
    embedding = response.get("Data", [{}])[0].get("Embedding", []) if response.get("Data") else []
    return {
        "status": "pass",
        "probe": "embedding",
        "request_id": response.get("RequestId"),
        "total_tokens": response.get("Usage", {}).get("TotalTokens"),
        "embedding_dimensions": len(embedding),
        "time_offset_seconds": client.time_offset_seconds,
    }


def probe_ws_token(client: TencentCloudClient, env: dict[str, str]) -> dict:
    bot_app_key = env.get("TENCENT_ADP_BOT_APP_KEY", "")
    if not bot_app_key or "your-" in bot_app_key or "填入" in bot_app_key:
        return {
            "status": "blocked",
            "probe": "ws-token",
            "reason": "TENCENT_ADP_BOT_APP_KEY is required after publishing the Tencent ADP app.",
        }
    response = client.call(
        service="lke",
        host="lke.tencentcloudapi.com",
        action="GetWsToken",
        version="2023-11-30",
        payload={
            "Type": 5,
            "BotAppKey": bot_app_key,
            "VisitorBizId": env.get("TENCENT_ADP_VISITOR_BIZ_ID") or "eco-execution-graph-local-dev",
        },
    )
    return {
        "status": "pass",
        "probe": "ws-token",
        "request_id": response.get("RequestId"),
        "balance_present": response.get("Balance") is not None,
        "input_len_limit": response.get("InputLenLimit"),
        "pattern": response.get("Pattern"),
        "token_present": bool(response.get("Token")),
        "time_offset_seconds": client.time_offset_seconds,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("probe", choices=["embedding", "ws-token", "all"], default="embedding", nargs="?")
    args = parser.parse_args()
    env = load_env()
    client = TencentCloudClient.from_env(env)
    results = []
    try:
        if args.probe in {"embedding", "all"}:
            results.append(probe_embedding(client))
        if args.probe in {"ws-token", "all"}:
            results.append(probe_ws_token(client, env))
    except (TencentCloudError, ValueError) as error:
        print(json.dumps({
            "status": "failed",
            "error_type": type(error).__name__,
            "code": getattr(error, "code", None),
            "request_id": getattr(error, "request_id", None),
            "message": str(error),
            "time_offset_seconds": getattr(client, "time_offset_seconds", 0),
        }, ensure_ascii=False))
        sys.exit(1)
    print(json.dumps(results[0] if len(results) == 1 else {"status": "pass", "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
