"""Offline OpenAI Images fixture. Never forwards requests to a supplier."""

import base64
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVn8AAAAASUVORK5CYII="
COUNTS = {"success": 0, "failure": 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/stats":
            return self.reply(200, COUNTS)
        self.reply(404, {"error": {"message": "fixture route not found"}})

    def do_POST(self):
        if self.path != "/v1/images/generations":
            return self.reply(404, {"error": {"message": "fixture route not found"}})
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 16384:
            return self.reply(400, {"error": {"message": "invalid fixture body"}})
        if self.headers.get("Authorization") != "Bearer fixture-key-not-valid-anywhere":
            return self.reply(401, {"error": {"type": "fixture_auth", "message": "invalid dummy key"}})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self.reply(400, {"error": {"message": "invalid JSON"}})
        if body.get("model") != "gpt-image-2-1k" or body.get("n") != 1:
            return self.reply(400, {"error": {"type": "invalid_request_error", "message": "unexpected model or count"}})
        if body.get("prompt") == "validation-failure":
            COUNTS["failure"] += 1
            return self.reply(400, {"error": {"type": "invalid_request_error", "message": "intentional offline failure"}})
        COUNTS["success"] += 1
        assert len(base64.b64decode(PIXEL)) > 0
        self.reply(200, {"created": 1, "data": [{"b64_json": PIXEL}]})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
