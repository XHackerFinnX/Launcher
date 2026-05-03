import os
import shutil
import logging
import subprocess
import sys
from pathlib import Path
import eel
import requests
import minecraft_launcher_lib
import json
from datetime import datetime

from db.database import create_connection
from utils.config import minecraft_directory, VERSIONS_LAUNCHER
from utils.validators import is_valid_login, is_valid_server_address

db_path = r"C:\.stoneworld\db\launcher.db"
log_path = r"C:\.stoneworld\logs\launcher.log"
REQUEST_TIMEOUT = (5, 20)
FILE_INTEGRITY_MANIFEST_URL = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher-file.json"
logger = logging.getLogger(__name__)
_log_viewer_process = None

def _download_file_to_target(url: str, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT) as response:
        response.raise_for_status()
        with open(target_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file.write(chunk)

@eel.expose
def insert_version(version):
    """Добавление новой версии в таблицу."""
    version = str(version).strip()
    if not version:
        return False
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT OR IGNORE INTO versions (version) VALUES (?)''',
        (version,)
    )
    conn.commit()
    conn.close()
    return True

@eel.expose
def get_versions():
    """Получение всех версий из базы данных."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT MIN(id) AS id, version
        FROM versions
        GROUP BY version
        ORDER BY version DESC
        '''
    )
    versions_list = cursor.fetchall()
    conn.close()
    return versions_list
    
@eel.expose
def insert_account(login):
    """Добавление нового аккаунта в таблицу."""
    if not is_valid_login(login):
        logger.warning("Отклонен некорректный логин: %s", login)
        return False
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''INSERT OR IGNORE INTO accounts (login) VALUES (?)''', (login,))
    conn.commit()
    conn.close()
    return True

@eel.expose
def delete_account(login):
    """Удаление аккаунта из базы данных."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''DELETE FROM accounts WHERE login = ?''', (login,))
    conn.commit()
    conn.close()

@eel.expose
def get_accounts():
    """Получение всех аккаунтов из базы данных."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT * FROM accounts''')
    account_list = cursor.fetchall()
    conn.close()
    return account_list

@eel.expose
def update_account_version(login, version):
    """Обновление выбора логина и версии для следущего захода в лаунчер"""
    if not is_valid_login(login):
        logger.warning("Попытка выбрать некорректный логин: %s", login)
        return False
    conn = create_connection(db_path)
    cursor = conn.cursor()
    # Аккаунт + версия в одной транзакции
    cursor.execute('''UPDATE accounts SET choose = 0''')
    cursor.execute('''UPDATE accounts SET choose = 1 WHERE login = ?''', (login,))
    cursor.execute('''UPDATE versions SET choose = 0''')
    cursor.execute('''UPDATE versions SET choose = 1 WHERE version = ?''', (version,))
    conn.commit()
    conn.close()
    return True
    
@eel.expose
def get_account_version():
    """Получение логина и версии при запуске лаунчера"""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT a.login, v.version
        FROM accounts AS a
        JOIN versions AS v
        ON a.choose = 1 AND v.choose = 1
        '''
    )
    choose = cursor.fetchall()
    if not choose:
        return []

    return choose[0][0], choose[0][1]

def insert_setting(memory, checkbox, bit_checkbox, optimiz_checkbox, argument):
    """Добавление новых данных в таблицу settings."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO settings (
                   memory,
                   checkbox,
                   bit_checkbox,
                   optimiz_checkbox,
                   argument,
                   open_log_viewer_checkbox) 
                   VALUES (?, ?, ?, ?, ?, ?)''', (memory, checkbox, bit_checkbox, optimiz_checkbox, argument, 1))
    conn.commit()
    conn.close()

def _ensure_settings_schema(cursor):
    cursor.execute("PRAGMA table_info(settings)")
    columns = {row[1] for row in cursor.fetchall()}
    required_columns = {
        "open_log_viewer_checkbox": "INTEGER DEFAULT 1",
        "theme_bg": "TEXT",
        "theme_panel": "TEXT",
        "theme_text": "TEXT",
        "theme_accent": "TEXT",
        "theme_accent2": "TEXT",
        "theme_background_image": "TEXT DEFAULT ''",
        "theme_json": "TEXT DEFAULT '{}'",
    }
    for column, column_type in required_columns.items():
        if column not in columns:
            cursor.execute(f"ALTER TABLE settings ADD COLUMN {column} {column_type}")

def ensure_settings_row():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_settings_schema(cursor)
    cursor.execute(
        '''
        INSERT INTO settings (
            memory,
            checkbox,
            bit_checkbox,
            optimiz_checkbox,
            argument,
            open_log_viewer_checkbox,
            theme_bg,
            theme_panel,
            theme_text,
            theme_accent,
            theme_accent2,
            theme_background_image,
            theme_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM settings)
        ''',
        (2048, 0, 0, 0, "", 1, "#0e1018", "#161826", "#e6e8f0", "#ffb86c", "#ff9a3c", "", "{}")
    )
    conn.commit()
    conn.close()

def _update_setting_field(field: str, value):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_settings_schema(cursor)
    cursor.execute(
        '''
        INSERT INTO settings (
            memory,
            checkbox,
            bit_checkbox,
            optimiz_checkbox,
            argument,
            open_log_viewer_checkbox,
            theme_bg,
            theme_panel,
            theme_text,
            theme_accent,
            theme_accent2,
            theme_background_image,
            theme_json
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM settings)
        ''',
        (2048, 0, 0, 0, "", 1, "#0e1018", "#161826", "#e6e8f0", "#ffb86c", "#ff9a3c", "", "{}")
    )
    cursor.execute(f"UPDATE settings SET {field} = ?", (value,))
    conn.commit()
    conn.close()
    
@eel.expose
def update_setting_memory(memory):
    """Обновление данных в таблице settings memory"""
    _update_setting_field("memory", int(memory))
    
@eel.expose
def update_setting_checkbox(value):
    """Обновление состояния чекбокса в базе данных (0 или 1)."""
    _update_setting_field("checkbox", int(value))
    
@eel.expose
def update_setting_bit_checkbox(value):
    _update_setting_field("bit_checkbox", int(value))
    
@eel.expose
def update_setting_optimiz_checkbox(value):
    _update_setting_field("optimiz_checkbox", int(value))
    
@eel.expose
def update_setting_argument(value):
    _update_setting_field("argument", value)
    
@eel.expose
def update_setting_open_log_viewer_checkbox(value):
    _update_setting_field("open_log_viewer_checkbox", int(value))
    
    
@eel.expose
def get_settings():
    """Получение всех настроек из таблицы settings."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_settings_schema(cursor)
    conn.commit()
    conn.close()
    ensure_settings_row()
    
    conn = create_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute(
        '''
        SELECT memory, checkbox, bit_checkbox, optimiz_checkbox, argument, open_log_viewer_checkbox,
               theme_bg, theme_panel, theme_text, theme_accent, theme_accent2, theme_background_image, theme_json
        FROM settings
        '''
    )
    setting = cursor.fetchone()
    conn.close()
    
    if setting:
        return {
            "memory": setting[0],
            "checkbox": setting[1],
            "bit_checkbox": setting[2],
            "optimiz_checkbox": setting[3],
            "argument": setting[4],
            "open_log_viewer_checkbox": setting[5] if setting[5] is not None else 1,
            "theme_bg": setting[6] or "#0e1018",
            "theme_panel": setting[7] or "#161826",
            "theme_text": setting[8] or "#e6e8f0",
            "theme_accent": setting[9] or "#ffb86c",
            "theme_accent2": setting[10] or "#ff9a3c",
            "theme_background_image": setting[11] or "",
            "theme_json": setting[12] or "{}"
        }
    else:
        return {
            "memory": 2048,
            "checkbox": 0,
            "bit_checkbox": 0,
            "optimiz_checkbox": 0,
            "argument": "",
            "open_log_viewer_checkbox": 1,
            "theme_bg": "#0e1018",
            "theme_panel": "#161826",
            "theme_text": "#e6e8f0",
            "theme_accent": "#ffb86c",
            "theme_accent2": "#ff9a3c",
            "theme_background_image": "",
            "theme_json": "{}"
        }
    
@eel.expose
def delete_versions_list(version):
    try:
        minecraft_directory_version = minecraft_directory + f"\\{version}"
        if os.path.exists(minecraft_directory_version):
            shutil.rmtree(minecraft_directory_version)
        delete_version_error(version)
        return True
    except Exception as e:
        print(f"Ошибка при удалении версии: {e}")
        return False
    
@eel.expose
def check_launcher_files_integrity():
    proxies = {"http": None, "https": None}
    summary = {
        "total": 0,
        "checked": 0,
        "installed": 0,
        "missing_before_install": 0,
        "status": "error",
        "message": "Не удалось выполнить проверку файлов."
    }

    try:
        response = requests.get(
            FILE_INTEGRITY_MANIFEST_URL,
            timeout=REQUEST_TIMEOUT,
            proxies=proxies
        )
        response.raise_for_status()
        manifest = response.json()
    except requests.exceptions.RequestException:
        logger.exception("Не удалось загрузить файл манифеста: %s", FILE_INTEGRITY_MANIFEST_URL)
        summary["message"] = "Не удалось загрузить список файлов для проверки."
        return summary
    except ValueError:
        logger.exception("Некорректный JSON в манифесте: %s", FILE_INTEGRITY_MANIFEST_URL)
        summary["message"] = "Файл проверки повреждён (некорректный JSON)."
        return summary

    files = manifest.get("files", [])
    if not isinstance(files, list) or not files:
        summary["status"] = "ok"
        summary["message"] = "Список файлов пуст. Проверять нечего."
        return summary

    total = len(files)
    summary["total"] = total

    for index, item in enumerate(files, start=1):
        file_name = str(item.get("name", "")).strip()
        file_path = str(item.get("path", "")).strip()
        file_url = str(item.get("url", "")).strip()

        if not file_name or not file_path or not file_url:
            logger.warning("Пропущена некорректная запись в манифесте: %s", item)
            summary["checked"] = index
            try:
                eel.updateIntegrityProgress({
                    "checked": index,
                    "total": total,
                    "status": "skipped",
                    "file": file_name or "unknown",
                    "message": "Файл пропущен: некорректная запись."
                })
            except Exception:
                logger.debug("Не удалось отправить прогресс проверки в UI", exc_info=True)
            continue

        target_path = Path(file_path) / file_name
        exists_before = target_path.exists()
        installed_now = False
        state = "ok" if exists_before else "installing"

        if not exists_before:
            summary["missing_before_install"] += 1
            try:
                eel.updateIntegrityProgress({
                    "checked": index - 1,
                    "total": total,
                    "status": "installing",
                    "file": file_name,
                    "message": f"Установка {file_name}..."
                })
            except Exception:
                logger.debug("Не удалось отправить статус установки в UI", exc_info=True)

            try:
                _download_file_to_target(file_url, target_path)
                installed_now = True
                summary["installed"] += 1
                state = "installed"
            except requests.exceptions.RequestException:
                logger.exception("Не удалось скачать файл %s", file_name)
                state = "error"
            except OSError:
                logger.exception("Не удалось сохранить файл %s", file_name)
                state = "error"

        summary["checked"] = index
        try:
            eel.updateIntegrityProgress({
                "checked": index,
                "total": total,
                "status": state,
                "file": file_name,
                "installed": installed_now
            })
        except Exception:
            logger.debug("Не удалось отправить прогресс проверки в UI", exc_info=True)

    if summary["missing_before_install"] == 0:
        summary["status"] = "ok"
        summary["message"] = "Все файлы прошли проверку."
    elif summary["installed"] == summary["missing_before_install"]:
        summary["status"] = "ok"
        summary["message"] = (
            f"Проверка завершена. Установлено {summary['installed']} из "
            f"{summary['missing_before_install']} отсутствующих файлов."
        )
    else:
        failed = summary["missing_before_install"] - summary["installed"]
        summary["status"] = "partial"
        summary["message"] = (
            f"Проверка завершена частично: установлено {summary['installed']}, "
            f"ошибок установки: {failed}."
        )

    return summary
    
@eel.expose
def check_server_info(ip):
    ip = str(ip).strip()
    if not is_valid_server_address(ip):
        logger.warning("Отклонен некорректный адрес сервера: %s", ip)
        return None
    url = f"https://api.mcstatus.io/v2/status/java/{ip}"
    
    try:
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            
            if data['online']:
                status = 'Online'
            else:
                status = 'Offline'
            
            try:
                server_info = {
                    "ip": ip,
                    "name": data.get('motd', 'Unknown').get('clean', 'Unknown'),
                    "players_online": data.get('players', {}).get('online', 0),
                    "players_max": data.get('players', {}).get('max', 0),
                    "version": data.get('version', 'Unknown').get('name_raw', 'Unknown'),
                    "status": status,
                    "icon": data['icon']
                }
            except Exception:
                server_info = {
                    "ip": ip,
                    "name": data['host'],
                    "players_online": 0,
                    "players_max": 0,
                    "version": 'Сервер не отвечает',
                    "status": status
                }
            exists = check_ip_address(ip)
            if not exists:
                add_ip_address(ip)
                
            return server_info

        else:
            return None
    except requests.exceptions.RequestException:
        logger.exception("Ошибка запроса статуса сервера: %s", ip)
        return None
    
@eel.expose
def get_ip_address():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT DISTINCT ip FROM servers ORDER BY ip COLLATE NOCASE''')
    server_ips = cursor.fetchall()
    conn.close()
    return [ip[0] for ip in server_ips]

@eel.expose
def delete_server_by_ip(ip_address):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''DELETE FROM servers WHERE ip = ?''', (ip_address,))
    conn.commit()
    conn.close()

@eel.expose 
def sum_time():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT SUM(hour) FROM timegame''')
    hour = cursor.fetchone()
    if hour[0] is None:
        conn.close()
        return 0
    
    conn.close()
    return hour[0]

@eel.expose 
def sum_time_last_date():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT date, hour FROM timegame''')
    hour_last = cursor.fetchall()
    if hour_last == []:
        conn.close()
        return '-', 0
    
    conn.close()
    sum_hour = 0
    for date_last, hour in hour_last:
        if hour_last[-1][0] == date_last:
            sum_hour += hour
            
    return hour_last[-1][0], round(sum_hour, 2)

def check_settings():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT * FROM settings''')
    setting = cursor.fetchall()
    conn.close()
    return setting

def get_memory():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT memory FROM settings''')
    memory = cursor.fetchone()
    conn.close()
    return memory

def get_checkbox():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT checkbox FROM settings''')
    checkbox = cursor.fetchone()
    conn.close()
    return checkbox[0]

def get_bit_optimiz_argument():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT bit_checkbox, optimiz_checkbox, argument FROM settings''')
    setting_all = cursor.fetchall()
    conn.close()
    return setting_all[0]

def delete_version_error(version):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''DELETE FROM versions WHERE version = ?''', (version,))
    conn.commit()
    conn.close()
    
@eel.expose
def delete_version_record(version):
    delete_version_error(version)
    return True
    
def add_ip_address(ip_address):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''INSERT OR IGNORE INTO servers (ip) VALUES (?)''', (ip_address,))
    conn.commit()
    conn.close()
    
def check_ip_address(ip_address):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT ip FROM servers WHERE ip = ?''', (ip_address,))
    server = cursor.fetchone()
    conn.close()
    return server[0] if server else None

def add_time(date, hour):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO timegame (date, hour) VALUES (?, ?)''', (date, hour))
    conn.commit()
    conn.close()

@eel.expose
def check_version_launcher():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT version FROM launcher''')
    launcher = cursor.fetchall()
    conn.close()
    
    url_version = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher.json"
    
    proxies = {
        "http": None,
        "https": None
    }
    
    try:
        response = requests.get(
            url=url_version, proxies=proxies, timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        json_data = response.json()
        launcher_version = launcher[0][0] if launcher else None

        return launcher_version != json_data['version']
    except requests.exceptions.RequestException:
        logger.exception("Не удалось проверить версию лаунчера")
        return False
    
def start_check_version_launcher():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''SELECT version FROM launcher''')
    launcher = cursor.fetchall()
    conn.close()

    if not launcher:
        return True
    else:
        return False

def update_last_version_launcher():
    
    url_version = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher.json"
    try:
        response = requests.get(url_version, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        json_data = response.json()
        version = json_data['version']
    except requests.exceptions.RequestException:
        logger.exception("Не удалось обновить версию лаунчера")
        return
    
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''UPDATE launcher SET version = ?''', (version,))
    conn.commit()
    conn.close()

def add_version_launcher():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute('''INSERT INTO launcher (version) VALUES (?)''', (VERSIONS_LAUNCHER,))
    conn.commit()
    conn.close()
    
@eel.expose
def read_launcher_logs(position=0, chunk_size=32768):
    try:
        position = int(position or 0)
        chunk_size = int(chunk_size or 32768)
    except (ValueError, TypeError):
        position = 0
        chunk_size = 32768

    if not os.path.exists(log_path):
        return {"text": "", "position": 0}

    file_size = os.path.getsize(log_path)
    if position > file_size:
        position = 0

    with open(log_path, "r", encoding="utf-8", errors="ignore") as file:
        file.seek(position)
        text = file.read(chunk_size)
        new_position = file.tell()

    return {"text": text, "position": new_position}

@eel.expose
def clear_launcher_logs():
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "w", encoding="utf-8"):
        pass
    return {"text": "", "position": 0}


@eel.expose
def open_external_log_viewer():
    global _log_viewer_process
    viewer_exe = r"C:\.stoneworld\access\SWLogViewer.exe"
    viewer_script = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "utils", "log_viewer.py")
    )

    try:
        if _log_viewer_process is not None and _log_viewer_process.poll() is None:
            return {"ok": True, "mode": "already_open"}

        if os.path.exists(viewer_exe):
            _log_viewer_process = subprocess.Popen([viewer_exe], close_fds=True)
            return {"ok": True, "mode": "exe"}

        _log_viewer_process = subprocess.Popen([sys.executable, viewer_script], close_fds=True)
        return {"ok": True, "mode": "python"}
    except Exception as error:
        logger.exception("Не удалось открыть окно логов")
        return {"ok": False, "error": str(error)}


@eel.expose
def get_online_minecraft_versions(limit=120):
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 120

    releases = []
    for item in minecraft_launcher_lib.utils.get_version_list():
        if item.get("type") == "release":
            releases.append(item["id"])
        if len(releases) >= limit:
            break

    forge_versions = []
    for version in releases[:50]:
        try:
            forge_id = minecraft_launcher_lib.forge.find_forge_version(version)
            if forge_id:
                forge_versions.append(f"Forge {version}")
        except Exception:
            continue

    fabric_versions = []
    for version in releases[:50]:
        try:
            if minecraft_launcher_lib.fabric.is_minecraft_version_supported(version):
                fabric_versions.append(f"Fabric {version}")
        except Exception:
            continue

    return {
        "releases": releases,
        "forge": forge_versions,
        "fabric": fabric_versions
    }

@eel.expose
def update_theme_settings(payload):
    payload = payload or {}
    allowed = {
        "theme_bg": "#0e1018",
        "theme_panel": "#161826",
        "theme_text": "#e6e8f0",
        "theme_accent": "#ffb86c",
        "theme_accent2": "#ff9a3c",
        "theme_background_image": "",
        "theme_json": "{}",
    }
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM settings LIMIT 1")
    if not cursor.fetchone():
        ensure_settings_row()
    for key, default in allowed.items():
        value = payload.get(key, default)
        if key == "theme_json" and not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        cursor.execute(f"UPDATE settings SET {key} = ?", (value,))
    conn.commit()
    conn.close()
    return True

@eel.expose
def get_saved_themes():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS themes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            theme_bg TEXT NOT NULL,
            theme_panel TEXT NOT NULL,
            theme_text TEXT NOT NULL,
            theme_accent TEXT NOT NULL,
            theme_accent2 TEXT NOT NULL,
            theme_background_image TEXT DEFAULT '',
            theme_json TEXT DEFAULT '{}'
        )
        '''
    )
    cursor.execute("PRAGMA table_info(themes)")
    theme_columns = {row[1] for row in cursor.fetchall()}
    if "theme_json" not in theme_columns:
        cursor.execute("ALTER TABLE themes ADD COLUMN theme_json TEXT DEFAULT '{}'")
        conn.commit()
    cursor.execute(
        '''
        SELECT id, name, theme_bg, theme_panel, theme_text, theme_accent, theme_accent2, theme_background_image, theme_json
        FROM themes
        ORDER BY id DESC
        '''
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": str(row[0]),
            "name": row[1],
            "theme_bg": row[2],
            "theme_panel": row[3],
            "theme_text": row[4],
            "theme_accent": row[5],
            "theme_accent2": row[6],
            "theme_background_image": row[7] or "",
            "theme_json": row[8] or "{}",
        }
        for row in rows
    ]


@eel.expose
def save_named_theme(payload):
    payload = payload or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "empty_name"}

    theme = {
        "theme_bg": payload.get("theme_bg", "#0e1018"),
        "theme_panel": payload.get("theme_panel", "#161826"),
        "theme_text": payload.get("theme_text", "#e6e8f0"),
        "theme_accent": payload.get("theme_accent", "#ffb86c"),
        "theme_accent2": payload.get("theme_accent2", "#ff9a3c"),
        "theme_background_image": payload.get("theme_background_image", ""),
        "theme_json": json.dumps(payload.get("theme_json", {}), ensure_ascii=False),
    }

    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(themes)")
    theme_columns = {row[1] for row in cursor.fetchall()}
    if "theme_json" not in theme_columns:
        cursor.execute("ALTER TABLE themes ADD COLUMN theme_json TEXT DEFAULT '{}'")
    cursor.execute(
        '''
        INSERT INTO themes (name, theme_bg, theme_panel, theme_text, theme_accent, theme_accent2, theme_background_image, theme_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            theme_bg=excluded.theme_bg,
            theme_panel=excluded.theme_panel,
            theme_text=excluded.theme_text,
            theme_accent=excluded.theme_accent,
            theme_accent2=excluded.theme_accent2,
            theme_background_image=excluded.theme_background_image,
            theme_json=excluded.theme_json
        ''',
        (
            name,
            theme["theme_bg"],
            theme["theme_panel"],
            theme["theme_text"],
            theme["theme_accent"],
            theme["theme_accent2"],
            theme["theme_background_image"],
            theme["theme_json"],
        ),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@eel.expose
def delete_saved_theme(theme_id):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM themes WHERE id = ?", (theme_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return {"ok": deleted}

def _mods_dir(version_name):
    return Path(minecraft_directory) / version_name / "mods"

@eel.expose
def list_installed_mods(version_name):
    mods_path = _mods_dir(version_name)
    if not mods_path.exists():
        return []
    out=[]
    for file in sorted(mods_path.glob("*.jar")):
        out.append({"name": file.name, "size": file.stat().st_size})
    return out

@eel.expose
def search_mods(provider, query, game_version, loader, limit=24, index='relevance'):
    provider = (provider or 'modrinth').lower()
    query = query or ''
    game_version = game_version or ''
    loader = loader or ''
    limit = max(1, min(int(limit or 24), 50))
    if provider == 'modrinth':
        facets = []
        if game_version:
            facets.append(f'["versions:{game_version}"]')
        if loader:
            facets.append(f'["categories:{loader}"]')
        facets_str = '[' + ','.join(facets) + ']'
        url = "https://api.modrinth.com/v2/search"
        params = {"query": query, "limit": limit, "index": index, "facets": facets_str}
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        hits = r.json().get('hits', [])
        return [{"provider":"modrinth","project_id":h.get('project_id'),"title":h.get('title'),"description":h.get('description'),"icon":h.get('icon_url'),"downloads":h.get('downloads',0),"author":h.get('author')} for h in hits]
    return []

@eel.expose
def install_mod(provider, project_id, version_name, game_version, loader):
    mods_path = _mods_dir(version_name)
    mods_path.mkdir(parents=True, exist_ok=True)
    if provider != 'modrinth':
        return {"ok": False, "error": "Provider not supported yet"}
    url = f"https://api.modrinth.com/v2/project/{project_id}/version"
    r = requests.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    versions = r.json()
    selected = None
    for ver in versions:
        if game_version and game_version not in ver.get('game_versions', []):
            continue
        if loader and loader not in ver.get('loaders', []):
            continue
        selected = ver
        break
    if not selected:
        return {"ok": False, "error": "Не найдена подходящая версия мода"}
    file_obj = next((f for f in selected.get('files', []) if f.get('primary')), None) or (selected.get('files') or [None])[0]
    if not file_obj:
        return {"ok": False, "error": "Файл мода отсутствует"}
    file_url = file_obj.get('url')
    filename = file_obj.get('filename')
    target = mods_path / filename
    _download_file_to_target(file_url, target)
    return {"ok": True, "name": filename, "size": target.stat().st_size, "installed_at": datetime.utcnow().isoformat()}