# A2A push notifications: the signature covers different bytes than the ones sent

**Component:** `plugins/platforms/a2a` (A2A platform adapter)
**Versions checked:** 0.20.1, 0.20.5, 0.20.6, 0.21.0 (`29112bef`) — present in all
**Severity:** every signed push notification is rejected by a correct receiver
**Report status:** written 2026-09-08 for upstream; not filed by us — see “Handover”.

---

## Summary

`_send_push_notification` signs one serialization of the payload and then sends a
different one. A receiver that verifies the `X-A2A-Signature` header the only way it
can — HMAC over the bytes it received — always gets a mismatch, so a *valid*
notification from an *honest* sender is rejected.

Two serializations of the same dict are involved:

* signed over `json.dumps(payload, sort_keys=True, ensure_ascii=False)`
* sent as `json.dumps(payload)` — different key order, and non-ASCII text escaped
  to `\uXXXX`

## Impact

Any A2A peer that validates push notifications drops them. The failure is silent on
the sending side: the POST succeeds, `metrics.push_sent` is incremented, and the log
line says the notification was sent. Only the receiver sees the mismatch, and it
cannot tell a broken signature from an attack — which is exactly the case the header
exists to distinguish.

Non-ASCII payloads make it unconditional. With ASCII-only content and a payload whose
keys already happen to be in sorted order the two serializations can coincide, so the
defect can look intermittent.

## Affected code (line numbers as of 0.21.0, `29112bef`)

`plugins/platforms/a2a/security.py:268-279`

```python
def sign_push_payload(payload: dict) -> str:
    ...
    body = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
```

`plugins/platforms/a2a/adapter.py:1204` and `:1210` (in `_send_push_notification`)

```python
        signature = security.sign_push_payload(payload)          # line 1204
        headers = {"Content-Type": "application/json"}
        if signature:
            headers["X-A2A-Signature"] = signature
        try:
            data = json.dumps(payload).encode("utf-8")           # line 1210
            req = urllib.request.Request(callback_url, data=data, headers=headers, method="POST")
```

The docstring of `sign_push_payload` states the receiver contract as “HMAC-ing the
JSON body (sorted keys)”. That contract is not satisfiable from the wire: the body on
the wire is not the sorted-key form, and a receiver only has the bytes.

## Reproduction

Self-contained; no network beyond loopback. Python 3 only.

```python
import hashlib, hmac, json, os, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, "plugins/platforms/a2a")
os.environ["A2A_PUSH_SECRET"] = "repro-secret"
import protocol, security

RECEIVED = {}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        RECEIVED["body"] = self.rfile.read(int(self.headers["Content-Length"]))
        RECEIVED["signature"] = self.headers.get("X-A2A-Signature", "")
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")
    def log_message(self, *_): pass

server = HTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()

# The two lines from _send_push_notification, in order.
payload = protocol.status_update("task-42", "ctx-1", "completed", "Смета пересчитана")
signature = security.sign_push_payload(payload)
data = json.dumps(payload).encode("utf-8")

import urllib.request
req = urllib.request.Request(
    f"http://127.0.0.1:{server.server_port}/hook",
    data=data,
    headers={"Content-Type": "application/json", "X-A2A-Signature": signature},
    method="POST",
)
urllib.request.urlopen(req, timeout=10).read()

# What any receiver can do: HMAC over the bytes that arrived.
over_received = hmac.new(b"repro-secret", RECEIVED["body"], hashlib.sha256).hexdigest()
print("header signature :", RECEIVED["signature"])
print("HMAC of received :", over_received)
print("accepted         :", hmac.compare_digest(RECEIVED["signature"], over_received))
```

Observed (0.21.0, `29112bef`):

```
sent body    : {"statusUpdate": {"taskId": "task-42", "contextId": "ctx-1", "status": {"state": "completed", ..., "text": "Смета ..."}}}
signed string: {"statusUpdate": {"contextId": "ctx-1", "status": {"message": {...,"text": "Смета пересчитана"...}, "state": "completed", ...}, "taskId": "task-42"}}

header signature : 2981027aecf7d2dfdc09c509d0da766ab900677b3075a330926c520ebcb0bb97
HMAC of received : f75029b9f011a723247f896158f1d8872c2d2b8d8df43ffacab4a8f2f338db99
accepted         : False
```

Expected: `accepted: True`. (The two digests differ on every run — the payload carries
a fresh `messageId` and timestamp. What is stable is that they differ from each other.)

## Why the current tests stay green

`tests/plugins/test_a2a_phase23.py::TestPushSigning::test_sign_push_payload_deterministic`
asserts the signature against a re-implementation of the function’s own body:

```python
expected = hmac_mod.new(
    b"test-secret-123",
    json.dumps(payload, sort_keys=True, ensure_ascii=False).encode(),
    hashlib.sha256,
).hexdigest()
assert sig == expected
```

That is a correct test of the primitive, and it passes. Nothing asserts the relation
that matters — *the signed bytes are the sent bytes* — so the send path was free to
serialize differently. A regression test would capture the POST body (as above) and
verify against that.

## Suggested fix

One line, in `adapter.py:1210` — serialize the same way the signature does:

```python
            data = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
```

A more robust variant, if you would rather not have two call sites agree by
convention: have the signing helper return the bytes it signed, and send exactly
those.

```python
# security.py
def push_body_and_signature(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    secret = get_push_secret()
    if not secret:
        return body, ""
    return body, hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
```

The second form also removes the receiver-side requirement to reproduce Python’s
exact `json.dumps` separators, which non-Python receivers cannot be expected to do.

There is already a path in the repository that does this correctly, and it is a
useful precedent: `agent/outbound_webhooks.py` builds the body once
(`_serialize_payload`), signs those bytes (`_build_delivery`), and sends the same
object (`_deliver`). We verified it end-to-end with a loopback receiver — including
Cyrillic content — and the signature validates.

## Version evidence

`plugins/platforms/a2a/security.py` is byte-identical from v2026.8.13 (0.20.1)
through 0.21.0 — git blob `753c202a548b` at every release tag in that range.
`adapter.py` changed once in 0.21.0 (blob `e54fa659ab6c` → `79842c88c676`); the diff
is a two-line addition wiring plugin platform handlers in `connect()`, and the two
lines quoted above are unchanged, only shifted by two (1202/1208 → 1204/1210).

## Handover

This report was prepared by the AECPilot team, which pins hermes-agent by commit and
does not patch the vendored checkout — a local fix would disappear on the next pin
bump and would only work on one machine. Filing upstream is the owner’s decision and
the owner’s action; nothing was sent from here.
