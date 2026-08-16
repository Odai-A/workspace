import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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

    def setUp(self):
        app_mod._clear_negative_cache('X004AWUF9B')
        app_mod._clear_negative_cache('XPENDING001')
        app_mod._clear_negative_cache('XTERMINAL01')
        app_mod._invalidate_used_scan_count_cache()

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

    def test_is_fnsku_task_terminal_helpers(self):
        self.assertFalse(app_mod._is_fnsku_task_terminal(None))
        self.assertFalse(app_mod._is_fnsku_task_terminal({'taskState': 0}))
        self.assertTrue(app_mod._is_fnsku_task_terminal({'taskState': 2}))
        self.assertTrue(app_mod._is_fnsku_task_terminal({'task_state': 3}))
        self.assertTrue(app_mod._is_fnsku_task_terminal({'finishedOn': '2026-01-01T00:00:00Z'}))

    def test_negative_cache_only_marks_explicitly(self):
        code = 'XNEGTEST01'
        self.assertFalse(app_mod._is_negatively_cached(code))
        app_mod._mark_negatively_cached(code)
        self.assertTrue(app_mod._is_negatively_cached(code))
        app_mod._clear_negative_cache(code)
        self.assertFalse(app_mod._is_negatively_cached(code))

    def test_scan_status_pending_when_asin_not_ready(self):
        mock_admin = MagicMock()
        empty = MagicMock()
        empty.data = []
        mock_admin.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = empty

        original_admin = app_mod.supabase_admin
        original_key = app_mod.os.environ.get('FNSKU_API_KEY')
        app_mod.supabase_admin = mock_admin
        app_mod.os.environ['FNSKU_API_KEY'] = 'test-key'
        try:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = '{"succeeded":true,"data":{"id":"t1","taskState":0,"asin":""}}'
            mock_resp.json.return_value = {
                'succeeded': True,
                'data': {'id': 't1', 'taskState': 0, 'asin': '', 'productName': 'Pending Item'},
            }
            with patch('app.requests.get', return_value=mock_resp):
                resp = self.client.get('/api/scan/status?code=XPENDING001&attempt=1')
            self.assertEqual(resp.status_code, 200)
            payload = resp.get_json() or {}
            self.assertTrue(payload.get('lookup_still_pending') or payload.get('processing'))
            self.assertFalse(payload.get('not_in_api_database'))
            self.assertFalse(app_mod._is_negatively_cached('XPENDING001'))
        finally:
            app_mod.supabase_admin = original_admin
            if original_key is None:
                app_mod.os.environ.pop('FNSKU_API_KEY', None)
            else:
                app_mod.os.environ['FNSKU_API_KEY'] = original_key

    def test_scan_status_terminal_miss_marks_negative_cache(self):
        mock_admin = MagicMock()
        empty = MagicMock()
        empty.data = []
        mock_admin.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = empty

        original_admin = app_mod.supabase_admin
        original_key = app_mod.os.environ.get('FNSKU_API_KEY')
        app_mod.supabase_admin = mock_admin
        app_mod.os.environ['FNSKU_API_KEY'] = 'test-key'
        try:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.text = '{"succeeded":true}'
            mock_resp.json.return_value = {
                'succeeded': True,
                'data': {
                    'id': 't2',
                    'taskState': 2,
                    'asin': '',
                    'finishedOn': '2026-01-01T00:00:00Z',
                    'productName': 'Gone',
                },
            }
            with patch('app.requests.get', return_value=mock_resp):
                resp = self.client.get('/api/scan/status?code=XTERMINAL01&attempt=2')
            self.assertEqual(resp.status_code, 200)
            payload = resp.get_json() or {}
            self.assertTrue(payload.get('not_in_api_database'))
            self.assertTrue(app_mod._is_negatively_cached('XTERMINAL01'))
        finally:
            app_mod.supabase_admin = original_admin
            if original_key is None:
                app_mod.os.environ.pop('FNSKU_API_KEY', None)
            else:
                app_mod.os.environ['FNSKU_API_KEY'] = original_key

    def test_scan_status_cache_hit_returns_success(self):
        mock_admin = MagicMock()
        hit = MagicMock()
        hit.data = [{
            'fnsku': 'X004AWUF9B',
            'asin': 'B0D8B91PQF',
            'product_name': 'Ceiling Fan',
            'price': 84.99,
            'image_url': 'https://example.com/fan.jpg',
            'brand': 'YUHAO',
            'category': 'Home',
            'description': 'Fan',
            'upc': '',
            'rainforest_raw_data': None,
        }]
        mock_admin.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = hit

        original_admin = app_mod.supabase_admin
        app_mod.supabase_admin = mock_admin
        try:
            resp = self.client.get('/api/scan/status?code=X004AWUF9B&attempt=1')
            self.assertEqual(resp.status_code, 200)
            payload = resp.get_json() or {}
            self.assertTrue(payload.get('success'))
            self.assertEqual(payload.get('asin'), 'B0D8B91PQF')
            self.assertTrue(payload.get('cached'))
            self.assertEqual(payload.get('source'), 'cache')
        finally:
            app_mod.supabase_admin = original_admin

    def test_log_scan_to_history_does_not_sleep(self):
        mock_client = MagicMock()
        existing = MagicMock()
        existing.data = []
        mock_client.from_.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = existing
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{'id': 1}])

        with patch('app._time.sleep') as sleep_mock:
            # Bind sleep if someone still imports time.sleep inside the function
            with patch('time.sleep') as sleep_mock2:
                logged = app_mod.log_scan_to_history(
                    'user-1', 'tenant-1', 'X004AWUF9B', 'B0D8B91PQF', mock_client
                )
                self.assertTrue(logged)
                sleep_mock.assert_not_called()
                sleep_mock2.assert_not_called()


if __name__ == "__main__":
    unittest.main()
