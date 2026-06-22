from __future__ import annotations

import re
from typing import Any


Finding = dict[str, str]


def validate_against_schema(data: Any, schema: dict[str, Any] | bool, path: str = "$") -> list[Finding]:
    findings: list[Finding] = []
    _validate(data, schema, path, schema, findings)
    return findings


def matches_schema(data: Any, schema: dict[str, Any] | bool, root_schema: dict[str, Any] | bool | None = None) -> bool:
    root = schema if root_schema is None else root_schema
    findings: list[Finding] = []
    _validate(data, schema, "$", root, findings)
    return not findings


def _validate(data: Any, schema: dict[str, Any] | bool, path: str, root_schema: dict[str, Any] | bool, findings: list[Finding]) -> None:
    if schema is True:
        return
    if schema is False:
        findings.append({"path": path, "message": "value is forbidden by schema"})
        return
    if not isinstance(schema, dict):
        return

    if "$ref" in schema:
        _validate(data, _resolve_ref(schema["$ref"], root_schema), path, root_schema, findings)
        return

    if "allOf" in schema:
        for subschema in schema["allOf"]:
            _validate(data, subschema, path, root_schema, findings)

    if "anyOf" in schema:
        if not any(matches_schema(data, subschema, root_schema) for subschema in schema["anyOf"]):
            findings.append({"path": path, "message": "value does not match any allowed schema"})

    if "oneOf" in schema:
        matches = sum(1 for subschema in schema["oneOf"] if matches_schema(data, subschema, root_schema))
        if matches != 1:
            findings.append({"path": path, "message": f"value must match exactly one schema; matched {matches}"})

    if "if" in schema:
        branch = "then" if matches_schema(data, schema["if"], root_schema) else "else"
        if branch in schema:
            _validate(data, schema[branch], path, root_schema, findings)

    if "type" in schema and not _type_matches(data, schema["type"]):
        findings.append({"path": path, "message": f"expected type {schema['type']}, got {_json_type(data)}"})
        return

    if "const" in schema and data != schema["const"]:
        findings.append({"path": path, "message": f"expected const {schema['const']!r}"})
    if "enum" in schema and data not in schema["enum"]:
        findings.append({"path": path, "message": f"value {data!r} is not in enum"})

    if isinstance(data, str):
        if "minLength" in schema and len(data) < schema["minLength"]:
            findings.append({"path": path, "message": f"string length {len(data)} is below minLength {schema['minLength']}"})
        if "maxLength" in schema and len(data) > schema["maxLength"]:
            findings.append({"path": path, "message": f"string length {len(data)} exceeds maxLength {schema['maxLength']}"})
        if "pattern" in schema and not re.search(schema["pattern"], data):
            findings.append({"path": path, "message": f"string does not match pattern {schema['pattern']}"})

    if isinstance(data, (int, float)) and not isinstance(data, bool):
        if "minimum" in schema and data < schema["minimum"]:
            findings.append({"path": path, "message": f"number {data} is below minimum {schema['minimum']}"})
        if "maximum" in schema and data > schema["maximum"]:
            findings.append({"path": path, "message": f"number {data} exceeds maximum {schema['maximum']}"})

    if isinstance(data, list):
        if "minItems" in schema and len(data) < schema["minItems"]:
            findings.append({"path": path, "message": f"array length {len(data)} is below minItems {schema['minItems']}"})
        if "maxItems" in schema and len(data) > schema["maxItems"]:
            findings.append({"path": path, "message": f"array length {len(data)} exceeds maxItems {schema['maxItems']}"})
        if "items" in schema:
            for index, item in enumerate(data):
                _validate(item, schema["items"], f"{path}[{index}]", root_schema, findings)

    if isinstance(data, dict):
        required = schema.get("required", [])
        for field in required:
            if field not in data:
                findings.append({"path": f"{path}.{field}", "message": "required property is missing"})
        properties = schema.get("properties", {})
        for field, value in data.items():
            if field in properties:
                _validate(value, properties[field], f"{path}.{field}", root_schema, findings)
            elif schema.get("additionalProperties") is False:
                findings.append({"path": f"{path}.{field}", "message": "additional property is not allowed"})
            elif isinstance(schema.get("additionalProperties"), dict):
                _validate(value, schema["additionalProperties"], f"{path}.{field}", root_schema, findings)
        if "minProperties" in schema and len(data) < schema["minProperties"]:
            findings.append({"path": path, "message": f"object has fewer than minProperties {schema['minProperties']}"})
        if "maxProperties" in schema and len(data) > schema["maxProperties"]:
            findings.append({"path": path, "message": f"object has more than maxProperties {schema['maxProperties']}"})


def _resolve_ref(ref: str, root_schema: dict[str, Any] | bool) -> dict[str, Any] | bool:
    if not isinstance(root_schema, dict) or not ref.startswith("#/"):
        raise ValueError(f"unsupported schema ref: {ref}")
    current: Any = root_schema
    for part in ref[2:].split("/"):
        key = part.replace("~1", "/").replace("~0", "~")
        current = current[key]
    return current


def _type_matches(data: Any, expected: str | list[str]) -> bool:
    if isinstance(expected, list):
        return any(_type_matches(data, item) for item in expected)
    if expected == "object":
        return isinstance(data, dict)
    if expected == "array":
        return isinstance(data, list)
    if expected == "string":
        return isinstance(data, str)
    if expected == "number":
        return isinstance(data, (int, float)) and not isinstance(data, bool)
    if expected == "integer":
        return isinstance(data, int) and not isinstance(data, bool)
    if expected == "boolean":
        return isinstance(data, bool)
    if expected == "null":
        return data is None
    return True


def _json_type(data: Any) -> str:
    if data is None:
        return "null"
    if isinstance(data, bool):
        return "boolean"
    if isinstance(data, dict):
        return "object"
    if isinstance(data, list):
        return "array"
    if isinstance(data, str):
        return "string"
    if isinstance(data, int):
        return "integer"
    if isinstance(data, float):
        return "number"
    return type(data).__name__
