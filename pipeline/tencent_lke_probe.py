from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

from tencent_cloud_signer import TencentCloudClient, TencentCloudError, load_env
from rag_resolve import sanitize_retrieve_record


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
        metadata_samples = [
            sanitize_retrieve_record(record, knowledge_base_id_suffix=knowledge_base_id[-6:])
            for record in records[:3]
            if isinstance(record, dict)
        ]
        results.append({
            "knowledge_base_id_suffix": knowledge_base_id[-6:],
            "status": "pass",
            "record_count": len(records),
            "sample_record_keys": sorted(sample.keys()),
            "sample_metadata_keys": sorted(metadata.keys()),
            "metadata_samples": metadata_samples,
            "request_id_present": bool(response.get("RequestId")),
        })
    return {
        "status": "pass",
        "probe": "rag-retrieve",
        "results": results,
        "time_offset_seconds": client.time_offset_seconds,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("probe", choices=["embedding", "tokenhub-chat", "rag-retrieve", "all"], default="embedding", nargs="?")
    args = parser.parse_args()
    env = load_env()
    client = TencentCloudClient.from_env(env)
    probe_map = {
        "embedding": lambda: probe_embedding(client),
        "tokenhub-chat": lambda: probe_tokenhub_chat(env),
        "rag-retrieve": lambda: probe_rag_retrieve(client, env),
    }

    if args.probe == "all":
        results = []
        for name in ("embedding", "tokenhub-chat", "rag-retrieve"):
            try:
                results.append(probe_map[name]())
            except (TencentCloudError, ValueError) as error:
                results.append({
                    "status": "failed",
                    "probe": name,
                    "error_type": type(error).__name__,
                    "code": getattr(error, "code", None),
                    "request_id": getattr(error, "request_id", None),
                    "message": str(error),
                    "time_offset_seconds": getattr(client, "time_offset_seconds", 0),
                })
        by_probe = {item.get("probe"): item for item in results}
        core_pass = (
            by_probe.get("tokenhub-chat", {}).get("status") == "pass"
            and by_probe.get("rag-retrieve", {}).get("status") == "pass"
        )
        print(json.dumps({
            "status": "pass" if core_pass else "failed",
            "knowledge_base_path": "direct_rag_retrieve_plus_tokenhub_deepseek",
            "results": results,
        }, ensure_ascii=False))
        sys.exit(0 if core_pass else 1)

    results = []
    try:
        results.append(probe_map[args.probe]())
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
