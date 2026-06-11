from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

from tencent_cloud_signer import TencentCloudClient, TencentCloudError, load_env


def configured(value: str | None) -> bool:
    return bool(value and "your-" not in value and "填入" not in value)


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


def probe_tokenhub_chat(env: dict[str, str]) -> dict:
    candidates = [
        ("TENCENT_TOKENHUB_API_KEY", env.get("TENCENT_TOKENHUB_API_KEY")),
        ("TENCENT_LKEAP_API_KEY", env.get("TENCENT_LKEAP_API_KEY")),
    ]
    api_keys = [(name, value) for name, value in candidates if configured(value)]
    if not api_keys:
        return {
            "status": "blocked",
            "probe": "tokenhub-chat",
            "reason": "TENCENT_TOKENHUB_API_KEY is required for TokenHub DeepSeek chat.",
        }
    base_url = (env.get("TENCENT_TOKENHUB_BASE_URL") or env.get("TENCENT_LKEAP_BASE_URL") or "https://tokenhub.tencentmaas.com/v1").rstrip("/")
    model = env.get("TENCENT_TOKENHUB_DEEPSEEK_MODEL") or env.get("TENCENT_LKEAP_DEEPSEEK_MODEL") or "deepseek-v4-flash-202605"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是一个连通性测试助手,只回答 OK。"},
            {"role": "user", "content": "请只回答 OK"},
        ],
        "stream": False,
        "max_tokens": 64,
        "temperature": 0,
    }
    errors = []
    data = None
    used_key_name = ""
    for key_name, api_key in api_keys:
        request = urllib.request.Request(
            f"{base_url}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
                used_key_name = key_name
                break
        except urllib.error.HTTPError as exc:
            errors.append({
                "key": key_name,
                "http_status": exc.code,
                "error_preview": exc.read().decode("utf-8", errors="replace")[:180],
            })
    if data is None:
        return {
            "status": "failed",
            "probe": "tokenhub-chat",
            "errors": errors,
        }
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    return {
        "status": "pass",
        "probe": "tokenhub-chat",
        "model": data.get("model") or model,
        "key_env": used_key_name,
        "id_present": bool(data.get("id")),
        "choice_count": len(data.get("choices") or []),
        "content_present": bool(message.get("content")),
        "usage_present": bool(data.get("usage")),
    }


def probe_rag_retrieve(client: TencentCloudClient, env: dict[str, str]) -> dict:
    knowledge_base_ids = [item.strip() for item in (env.get("TENCENT_LKE_KNOWLEDGE_BASE_IDS") or "").split(",") if item.strip()]
    if not knowledge_base_ids:
        return {
            "status": "blocked",
            "probe": "rag-retrieve",
            "reason": "TENCENT_LKE_KNOWLEDGE_BASE_IDS is required.",
        }
    results = []
    for knowledge_base_id in knowledge_base_ids[:2]:
        response = client.call(
            service="lkeap",
            host="lkeap.tencentcloudapi.com",
            action="RetrieveKnowledge",
            version="2024-05-22",
            payload={
                "KnowledgeBaseId": knowledge_base_id,
                "Query": "危废标签不规范",
                "RetrievalSetting": {"TopK": 3},
            },
            region=env.get("TENCENT_LKE_REGION") or "ap-guangzhou",
        )
        records = response.get("Records") or []
        sample = records[0] if records and isinstance(records[0], dict) else {}
        metadata = sample.get("Metadata") if isinstance(sample.get("Metadata"), dict) else {}
        results.append({
            "knowledge_base_id_suffix": knowledge_base_id[-6:],
            "status": "pass",
            "record_count": len(records),
            "sample_record_keys": sorted(sample.keys()),
            "sample_metadata_keys": sorted(metadata.keys()),
            "request_id_present": bool(response.get("RequestId")),
        })
    return {
        "status": "pass",
        "probe": "rag-retrieve",
        "results": results,
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
    parser.add_argument("probe", choices=["embedding", "tokenhub-chat", "rag-retrieve", "ws-token", "all"], default="embedding", nargs="?")
    args = parser.parse_args()
    env = load_env()
    client = TencentCloudClient.from_env(env)
    results = []
    try:
        if args.probe in {"embedding", "all"}:
            results.append(probe_embedding(client))
        if args.probe in {"tokenhub-chat", "all"}:
            results.append(probe_tokenhub_chat(env))
        if args.probe in {"rag-retrieve", "all"}:
            results.append(probe_rag_retrieve(client, env))
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
