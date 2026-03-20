import sys
import unittest
from pathlib import Path

# Ensure repo root is on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app as app_mod


class TestScanEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app_mod.app.testing = True
        cls.client = app_mod.app.test_client()

    def test_scan_product_invalid_json_returns_400(self):
        resp = self.client.post("/api/scan", data="")
        self.assertEqual(resp.status_code, 400)
        payload = resp.get_json() or {}
        self.assertEqual(payload.get("error"), "invalid_json")

    def test_scan_product_missing_user_id_returns_401(self):
        resp = self.client.post("/api/scan", json={"code": "XFNKU123456"})
        self.assertEqual(resp.status_code, 401)
        payload = resp.get_json() or {}
        self.assertEqual(payload.get("error"), "unauthorized")

    def test_scan_status_missing_code_returns_400(self):
        resp = self.client.get("/api/scan/status")
        self.assertEqual(resp.status_code, 400)
        payload = resp.get_json() or {}
        self.assertEqual(payload.get("error"), "Invalid code")

    def test_scan_status_supabase_unavailable_returns_503(self):
        original_supabase_admin = app_mod.supabase_admin
        app_mod.supabase_admin = None
        try:
            resp = self.client.get("/api/scan/status?code=XFNKU123456")
            self.assertEqual(resp.status_code, 503)
            payload = resp.get_json() or {}
            self.assertEqual(payload.get("error"), "Service unavailable")
        finally:
            app_mod.supabase_admin = original_supabase_admin


if __name__ == "__main__":
    unittest.main()

