"""End-to-end smoke test against running services: register, login, submit a replay, read the board."""

import json
import sys
import urllib.error
import urllib.request


def call(method: str, url: str, body: dict | None = None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("content-type", "application/json")
    if token:
        request.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def expect(label: str, got, want) -> None:
    if got != want:
        sys.exit(f"FAIL {label}: expected {want!r}, got {got!r}")
    print(f"ok   {label}")


def main() -> None:
    base, replay = sys.argv[1], json.loads(sys.argv[2])
    credentials = {"username": "smoke_player", "password": "smoke-test-password-123"}

    status, _ = call("POST", f"{base}/api/auth/register", credentials)
    expect("register", status, 201)

    status, body = call("POST", f"{base}/api/auth/login", credentials)
    expect("login", status, 200)
    token = body["access_token"]

    status, body = call("POST", f"{base}/api/runs", {"level_id": "trust-nothing", "replay": [2, 30]}, token)
    expect("unfinished replay is rejected", status, 422)

    status, body = call("POST", f"{base}/api/runs", {"level_id": "trust-nothing", "replay": replay}, token)
    expect("winning replay is accepted", status, 201)
    expect("rank", body["rank"], 1)
    print(f"     {body['frames']} frames, {body['deaths']} deaths")

    status, body = call("GET", f"{base}/api/leaderboard/trust-nothing")
    expect("leaderboard", [(e["username"], e["rank"]) for e in body], [("smoke_player", 1)])

    status, body = call("GET", f"{base}/api/progress", token=token)
    expect("progress", [e["level_id"] for e in body], ["trust-nothing"])


main()
