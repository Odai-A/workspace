"""
Tests for manifest import helpers (shared cache, ASIN validation, Rainforest cache completeness).
Run: python -m unittest tests.test_manifest_import -v
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

# Ensure repo root is on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestManifestImportHelpers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import app as app_mod

        cls.app = app_mod

    def test_import_valid_asin(self):
        m = self.app
        self.assertTrue(m._import_valid_asin("B012345678"))
        self.assertTrue(m._import_valid_asin("b012345678"))
        self.assertTrue(m._import_valid_asin("B0ABCDEFGH"))
        self.assertFalse(m._import_valid_asin("X012345678"))
        self.assertFalse(m._import_valid_asin(""))
        self.assertFalse(m._import_valid_asin(None))

    def test_import_synthetic_fnsku_for_asin(self):
        self.assertEqual(
            self.app._import_synthetic_fnsku_for_asin("B012345678"),
            "__ASIN__B012345678",
        )

    def test_import_rainforest_cache_complete(self):
        m = self.app
        self.assertFalse(m._import_rainforest_cache_complete(None))
        self.assertFalse(m._import_rainforest_cache_complete({}))
        self.assertFalse(m._import_rainforest_cache_complete({"rainforest_raw_data": None}))
        short_title = {"product": {"title": "ab"}}
        self.assertFalse(m._import_rainforest_cache_complete({"rainforest_raw_data": short_title}))
        good = {"product": {"title": "A real product title here"}}
        self.assertTrue(m._import_rainforest_cache_complete({"rainforest_raw_data": good}))
        good_str = {"rainforest_raw_data": json.dumps(good)}
        self.assertTrue(m._import_rainforest_cache_complete(good_str))

    def test_import_parse_quantity(self):
        m = self.app
        self.assertEqual(m._import_parse_quantity(None), 1)
        self.assertEqual(m._import_parse_quantity(""), 1)
        self.assertEqual(m._import_parse_quantity(5), 5)
        self.assertEqual(m._import_parse_quantity("3"), 3)
        self.assertEqual(m._import_parse_quantity("0"), 1)
        self.assertEqual(m._import_parse_quantity("bad"), 1)

    def test_migration_020_exists(self):
        p = ROOT / "supabase_migrations" / "020_import_batches_shared_enrichment.sql"
        self.assertTrue(p.is_file())
        text = p.read_text(encoding="utf-8")
        self.assertIn("import_batches", text)
        self.assertIn("try_lock_enrichment", text)
        self.assertIn("global_enrichment_locks", text)

    def test_migration_021_raw_row_exists(self):
        p = ROOT / "supabase_migrations" / "021_import_batch_items_raw_row.sql"
        self.assertTrue(p.is_file())
        self.assertIn("raw_row", p.read_text(encoding="utf-8"))

    def test_get_api_cache_row_prefers_fnsku(self):
        """Global cache: first lookup by FNSKU when present."""
        admin = MagicMock()
        tbl = MagicMock()
        tbl.select.return_value = tbl
        tbl.eq.return_value = tbl
        tbl.limit.return_value = tbl
        tbl.execute.return_value = MagicMock(data=[{"fnsku": "XFN1", "asin": "B012345678"}])
        admin.table.return_value = tbl
        r = self.app._import_get_api_cache_row(admin, "XFN1", "B012345678")
        self.assertIsNotNone(r)
        self.assertEqual(r.get("fnsku"), "XFN1")
        tbl.execute.assert_called_once()

    def test_get_api_cache_row_asin_when_no_fnsku(self):
        """Without FNSKU, match by ASIN (shared catalog across businesses)."""
        admin = MagicMock()
        tbl = MagicMock()
        tbl.select.return_value = tbl
        tbl.eq.return_value = tbl
        tbl.limit.return_value = tbl
        tbl.execute.return_value = MagicMock(data=[{"fnsku": "__ASIN__B012345678", "asin": "B012345678"}])
        admin.table.return_value = tbl
        r = self.app._import_get_api_cache_row(admin, None, "B012345678")
        self.assertIsNotNone(r)
        self.assertEqual(r.get("asin"), "B012345678")


if __name__ == "__main__":
    unittest.main()
