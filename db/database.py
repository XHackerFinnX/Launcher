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
                            argument TEXT)''')
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