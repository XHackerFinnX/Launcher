import os
import sqlite3
import tempfile
import unittest

from db.database import init_database
from utils.validators import is_valid_login, is_valid_server_address


class LauncherSmokeTests(unittest.TestCase):
    def test_login_validation(self):
        self.assertTrue(is_valid_login("Player_123"))
        self.assertFalse(is_valid_login("ab"))
        self.assertFalse(is_valid_login("bad login"))

    def test_server_validation(self):
        self.assertTrue(is_valid_server_address("example.org"))
        self.assertTrue(is_valid_server_address("127.0.0.1:25565"))
        self.assertFalse(is_valid_server_address("http://bad"))

    def test_db_migrations_create_unique_indexes(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_file = os.path.join(tmp, "launcher.db")
            init_database(db_file)
            conn = sqlite3.connect(db_file)
            cur = conn.cursor()
            cur.execute("PRAGMA index_list('accounts')")
            indexes = cur.fetchall()
            conn.close()
            self.assertTrue(any("idx_accounts_login" in row[1] for row in indexes))


if __name__ == "__main__":
    unittest.main()