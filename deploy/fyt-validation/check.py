"""Verify the local offline gateway fixture; never contacts a real supplier."""

import argparse
import base64
import json
import time
import urllib.error
import urllib.request
from pathlib import Path


BASE = "http://127.0.0.1:13100"
MODEL = "gpt-image-2-1k"


def request(path, body=None, token=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=payload, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = json.load(response)
        if data.get("success") is False:
            raise RuntimeError("Local fixture API rejected " + path)
        return response.status, data, response.headers.get("X-Oneapi-Request-Id")


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(env_path):
    private = dict(
        line.split("=", 1) for line in env_path.read_text().splitlines()
        if line and not line.startswith("#") and "=" in line
    )
    deadline = time.monotonic() + 30
    while True:
        try:
            _, setup, _ = request("/api/setup")
            break
        except (OSError, ValueError):
            if time.monotonic() >= deadline:
                raise RuntimeError("Local fixture did not become ready") from None
            time.sleep(1)
    _, status_body, _ = request("/api/status")
    check(status_body.get("data", {}).get("version") == "c06146b96-validation",
          "Refusing to configure a service other than the isolated validation API")
    username = private["FYT_VALIDATION_ADMIN_USERNAME"]
    password = private["FYT_VALIDATION_ADMIN_PASSWORD"]
    if not setup["data"]["status"]:
        request("/api/setup", {
            "username": username, "password": password, "confirmPassword": password,
            "SelfUseModeEnabled": False, "DemoSiteEnabled": False,
        })
    _, login, _ = request("/api/user/login", {"username": username, "password": password})
    access = login["data"]["access_token"]
    for key, value in {
        "ModelPrice": json.dumps({MODEL: 0.05}),
        "ModelDiscount": "{}", "GroupRatio": '{"default":1}',
    }.items():
        request("/api/option/", {"key": key, "value": value}, access, "PUT")

    _, channels, _ = request("/api/channel/", token=access)
    items = channels["data"]["items"]
    check(all(item["name"] == "offline-image-fixture" for item in items),
          "Unexpected channel in the isolated fixture")
    if not items:
        request("/api/channel/", {"mode": "single", "channel": {
            "name": "offline-image-fixture", "type": 60, "status": 1,
            "key": "fixture-key-not-valid-anywhere", "base_url": "http://mock:8080",
            "models": MODEL, "group": "default", "weight": 1, "auto_ban": 0,
        }}, access)
    else:
        check(all(item["base_url"] == "http://mock:8080" for item in items),
              "Fixture is not using its offline upstream")

    _, tokens, _ = request("/api/token/", token=access)
    token_row = next((t for t in tokens["data"]["items"] if t["name"] == "offline-image-check"), None)
    if token_row is None:
        _, created, _ = request("/api/token/", {
            "name": "offline-image-check", "expired_time": -1,
            "remain_quota": 1000000, "unlimited_quota": False,
            "group": "default", "model_limits_enabled": True, "model_limits": MODEL,
        }, access)
        token_id = created["data"]["id"]
    else:
        token_id = token_row["id"]
    _, secret, _ = request("/api/token/" + str(token_id) + "/key", {}, access)
    relay_key = secret["data"]["key"]
    if private.get("FYT_VALIDATION_API_KEY") != relay_key:
        with env_path.open("a") as private_file:
            private_file.write("FYT_VALIDATION_API_KEY=" + relay_key + "\n")

    def quota():
        return request("/api/user/self", token=access)[1]["data"]["quota"]

    before = quota()
    status, result, request_id = request("/v1/images/generations", {
        "model": MODEL, "prompt": "offline-validation-pixel", "n": 1,
        "size": "1024x1024", "response_format": "b64_json", "stream": False,
    }, relay_key)
    check(status == 200, "Image fixture response was not successful")
    check(bool(request_id), "Gateway response request ID is missing")
    check(base64.b64decode(result["data"][0]["b64_json"]).startswith(b"\x89PNG"),
          "Image fixture did not return its test PNG")
    after = quota()
    check(before - after == 25000, "Expected exactly 25000 quota for one fixture image")

    status, _, failure_id = request("/v1/images/generations", {
        "model": MODEL, "prompt": "validation-failure", "n": 1,
        "size": "1024x1024", "response_format": "b64_json", "stream": False,
    }, relay_key)
    check(status == 400, "Expected deliberate fixture failure")
    deadline = time.monotonic() + 10
    refunded = quota()
    while refunded != after and time.monotonic() < deadline:
        time.sleep(0.1)
        refunded = quota()
    check(refunded == after, "Failed request did not refund its reservation")
    print(json.dumps({
        "environment": BASE, "upstream": "offline mock only", "model": MODEL,
        "successful_image_quota": before - after, "failed_request_net_quota": after - refunded,
        "image_response": "fixed 1x1 test PNG, not a generated image",
        "success_request_id": request_id, "failure_request_id": failure_id,
        "real_supplier_requests": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    run(args.env_file)
