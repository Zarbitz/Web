#!/usr/bin/env python3
"""
Local server for the Unified Master Zarr v3 Dam Observatory Dashboard.
Serves:
  /              -> dashboard/index.html & assets
  /zarr/<path>   -> Single Unified Master Zarr v3 Store (data/all_dams_master.zarr)
                    containing all 390 dams' metadata, registry arrays, and
                    dam-wise / date-wise displacement, velocity, coherence,
                    strain_rate, stress, and principal_angle arrays.
"""
from __future__ import annotations
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
from pathlib import Path
import sys
from urllib.parse import unquote, urlparse
import webbrowser

PORT = int(os.environ.get("PORT", "8767"))
HERE = Path(__file__).resolve().parent
MASTER_ZARR = (HERE.parent / "data" / "all_dams_master.zarr").resolve()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        req_path = unquote(parsed.path)

        if req_path.startswith("/zarr/") or req_path == "/zarr":
            rel = req_path[len("/zarr"):].lstrip("/") or "zarr.json"
            target = (MASTER_ZARR / rel).resolve()
            if not str(target).startswith(str(MASTER_ZARR)) or not target.is_file():
                self.send_error(404, f"Zarr node not found in all_dams_master.zarr: {rel}")
                return

            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/json; charset=utf-8"
                if target.suffix == ".json"
                else "application/octet-stream",
            )
            self.send_header("Content-Length", str(target.stat().st_size))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            with open(target, "rb") as f:
                self.wfile.write(f.read())
            return

        return super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    if not MASTER_ZARR.exists():
        sys.exit(f"Missing Master Zarr store at {MASTER_ZARR}")
    url = f"http://127.0.0.1:{PORT}"
    print(f"Unified Master Zarr Dam Observatory -> {url}")
    print(f"Single Zarr Source -> {MASTER_ZARR}")
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
