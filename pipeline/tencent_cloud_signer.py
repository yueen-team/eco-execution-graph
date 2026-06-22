from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"


class TencentCloudError(RuntimeError):
    def __init__(self, code: str, message: str, request_id: str | None = None) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.request_id = request_id


def load_env(path: Path = ENV_PATH) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for raw in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    for key, value in os.environ.items():
        if key.startswith("TENCENT_") and value:
            env[key] = value
    return env


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def _utc_timestamp() -> int:
    return int(dt.datetime.now(dt.timezone.utc).timestamp())


def _server_time_from_message(message: str) -> int | None:
    match = re.search(r"server time\s+(\d+)", message, flags=re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))


@dataclass
class TencentCloudClient:
    secret_id: str
    secret_key: str
    region: str = "ap-guangzhou"
    time_offset_seconds: int = 0

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "TencentCloudClient":
        env = env or load_env()
        missing = [
            key
            for key in ("TENCENT_LKE_SECRET_ID", "TENCENT_LKE_SECRET_KEY")
            if not env.get(key) or "your-" in env.get(key, "") or "填入" in env.get(key, "")
        ]
        if missing:
            raise ValueError(f"missing Tencent Cloud credentials: {', '.join(missing)}")
        offset = int(env.get("TENCENT_CLOUD_TIME_OFFSET_SECONDS") or "0")
        return cls(
            secret_id=env["TENCENT_LKE_SECRET_ID"],
            secret_key=env["TENCENT_LKE_SECRET_KEY"],
            region=env.get("TENCENT_LKE_REGION") or "ap-guangzhou",
            time_offset_seconds=offset,
        )

    def call(
        self,
        *,
        service: str,
        host: str,
        action: str,
        version: str,
        payload: dict[str, Any],
        region: str | None = None,
        retry_on_time_skew: bool = True,
    ) -> dict[str, Any]:
        try:
            return self._call_once(
                service=service,
                host=host,
                action=action,
                version=version,
                payload=payload,
                region=region or self.region,
                timestamp=_utc_timestamp() + self.time_offset_seconds,
            )
        except TencentCloudError as error:
            if not retry_on_time_skew or error.code != "AuthFailure.SignatureExpire":
                raise
            server_time = _server_time_from_message(error.message)
            if server_time is None:
                raise
            self.time_offset_seconds = server_time - _utc_timestamp()
            return self._call_once(
                service=service,
                host=host,
                action=action,
                version=version,
                payload=payload,
                region=region or self.region,
                timestamp=_utc_timestamp() + self.time_offset_seconds,
            )

    def _call_once(
        self,
        *,
        service: str,
        host: str,
        action: str,
        version: str,
        payload: dict[str, Any],
        region: str,
        timestamp: int,
    ) -> dict[str, Any]:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        content_type = "application/json; charset=utf-8"
        date = dt.datetime.fromtimestamp(timestamp, dt.timezone.utc).strftime("%Y-%m-%d")
        canonical_headers = f"content-type:{content_type}\nhost:{host}\nx-tc-action:{action.lower()}\n"
        signed_headers = "content-type;host;x-tc-action"
        canonical_request = "\n".join([
            "POST",
            "/",
            "",
            canonical_headers,
            signed_headers,
            hashlib.sha256(body.encode("utf-8")).hexdigest(),
        ])
        credential_scope = f"{date}/{service}/tc3_request"
        string_to_sign = "\n".join([
            "TC3-HMAC-SHA256",
            str(timestamp),
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ])
        secret_date = _sign(("TC3" + self.secret_key).encode("utf-8"), date)
        secret_service = _sign(secret_date, service)
        secret_signing = _sign(secret_service, "tc3_request")
        signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        authorization = (
            "TC3-HMAC-SHA256 "
            f"Credential={self.secret_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        request = urllib.request.Request(
            f"https://{host}/",
            data=body.encode("utf-8"),
            headers={
                "Authorization": authorization,
                "Content-Type": content_type,
                "Host": host,
                "X-TC-Action": action,
                "X-TC-Timestamp": str(timestamp),
                "X-TC-Version": version,
                "X-TC-Region": region,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            data = json.loads(exc.read().decode("utf-8", errors="replace"))
        response = data.get("Response", {})
        error = response.get("Error")
        if error:
            raise TencentCloudError(error.get("Code", "Unknown"), error.get("Message", ""), response.get("RequestId"))
        return response
