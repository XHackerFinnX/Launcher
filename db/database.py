import sqlite3

def create_connection(db_file):
    conn = sqlite3.connect(db_file)
    return conn
        
        
def create_table_versions(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS versions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            version TEXT NOT NULL,
                            choose INTEGER)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы versions: {e}")
        
    
def create_table_accounts(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS accounts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            login TEXT NOT NULL,
                            choose INTEGER)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы accounts: {e}")
        
        
def create_table_settings(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS settings (
                            memory INTEGER,
                            checkbox INTEGER,
                            bit_checkbox INTEGER,
                            optimiz_checkbox INTEGER,
                            argument TEXT,
                            open_log_viewer_checkbox INTEGER DEFAULT 1)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы settings: {e}")
        
        
def create_table_server(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS servers (ip TEXT)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы servers: {e}")
        

def create_table_time(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS timegame (date TEXT, hour FLOAT)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы timegame: {e}")
        
        
def create_table_versions_launcher(conn):
    try:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS launcher (version TEXT)''')
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы launcher: {e}")

def create_table_themes(conn):
    try:
        cursor = conn.cursor()
        cursor.execute(
            '''CREATE TABLE IF NOT EXISTS themes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL UNIQUE,
                            theme_bg TEXT NOT NULL,
                            theme_panel TEXT NOT NULL,
                            theme_text TEXT NOT NULL,
                            theme_accent TEXT NOT NULL,
                            theme_accent2 TEXT NOT NULL,
                            theme_background_image TEXT DEFAULT '',
                            theme_json TEXT DEFAULT '{}')'''
        )
        conn.commit()
    except sqlite3.Error as e:
        print(f"Ошибка при создании таблицы themes: {e}")

def apply_migrations(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA user_version")
    version = cursor.fetchone()[0]

    if version < 1:
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_version ON versions(version)"
        )
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_login ON accounts(login)"
        )
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_ip ON servers(ip)"
        )
        cursor.execute("PRAGMA user_version = 1")
        conn.commit()
        
    if version < 2:
        cursor.execute("PRAGMA table_info(settings)")
        columns = {row[1] for row in cursor.fetchall()}
        if "open_log_viewer_checkbox" not in columns:
            cursor.execute(
                "ALTER TABLE settings ADD COLUMN open_log_viewer_checkbox INTEGER DEFAULT 1"
            )
            cursor.execute(
                "UPDATE settings SET open_log_viewer_checkbox = 1 "
                "WHERE open_log_viewer_checkbox IS NULL"
            )
        cursor.execute("PRAGMA user_version = 2")
        conn.commit()
        
    if version < 3:
        cursor.execute("PRAGMA table_info(settings)")
        columns = {row[1] for row in cursor.fetchall()}
        theme_columns = {
            "theme_bg", "theme_panel", "theme_text", "theme_accent", "theme_accent2", "theme_background_image"
        }
        for column in theme_columns:
            if column not in columns:
                if column == "theme_background_image":
                    cursor.execute(f"ALTER TABLE settings ADD COLUMN {column} TEXT DEFAULT ''")
                else:
                    cursor.execute(f"ALTER TABLE settings ADD COLUMN {column} TEXT")
        cursor.execute(
            "UPDATE settings SET "
            "theme_bg = COALESCE(theme_bg, '#0e1018'), "
            "theme_panel = COALESCE(theme_panel, '#161826'), "
            "theme_text = COALESCE(theme_text, '#e6e8f0'), "
            "theme_accent = COALESCE(theme_accent, '#ffb86c'), "
            "theme_accent2 = COALESCE(theme_accent2, '#ff9a3c'), "
            "theme_background_image = COALESCE(theme_background_image, '')"
        )
        cursor.execute("PRAGMA user_version = 3")
        conn.commit()
        
    if version < 4:
        cursor.execute("PRAGMA table_info(themes)")
        columns = {row[1] for row in cursor.fetchall()}
        if "theme_json" not in columns:
            cursor.execute("ALTER TABLE themes ADD COLUMN theme_json TEXT DEFAULT '{}'")
        cursor.execute("PRAGMA user_version = 4")
        conn.commit()


def init_database(db_file):
    conn = create_connection(db_file)
    create_table_versions(conn)
    create_table_accounts(conn)
    create_table_settings(conn)
    create_table_server(conn)
    create_table_time(conn)
    create_table_versions_launcher(conn)
    create_table_themes(conn)
    apply_migrations(conn)
    conn.close()