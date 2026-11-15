"""The trailhead API: serves the trail list as JSON on http://localhost:8787/trails."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "trails.json"
PORT = 8787


class Trails(BaseHTTPRequestHandler):
    """Answers GET /trails with every trail, and anything else with 404."""

    def do_GET(self):
        if self.path != "/trails":
            self.send_error(404)
            return
        body = DATA.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"trailhead API on http://localhost:{PORT}/trails")
    HTTPServer(("", PORT), Trails).serve_forever()
