import os
import shutil
import logging
import subprocess
import sys
import socket
from pathlib import Path
import eel
import requests
import minecraft_launcher_lib
import json
import time
from datetime import datetime
from urllib.parse import urljoin
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Optional

from db.database import create_connection
from utils.config import minecraft_directory, VERSIONS_LAUNCHER
from utils.validators import is_valid_login, is_valid_server_address

db_path = r"C:\.stoneworld\db\launcher.db"
log_path = r"C:\.stoneworld\logs\launcher.log"
REQUEST_TIMEOUT = (5, 20)
FILE_INTEGRITY_MANIFEST_URL = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher-file.json"
logger = logging.getLogger(__name__)
_log_viewer_process = None
NETWORK_CONFIG_PATH = Path(r"C:\.stoneworld\db\network.json")


def _load_network_config():
    defaults = {
        "backend_url": "",
        "active_room": "",
        "nickname": "",
        "api_prefix": "/launcher",
    }
    try:
        if NETWORK_CONFIG_PATH.exists():
            data = json.loads(NETWORK_CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                defaults.update(data)
    except Exception:
        logger.exception("Не удалось прочитать network config")
    return defaults


def _save_network_config(data: dict):
    NETWORK_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    NETWORK_CONFIG_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _api_request(method: str, path: str, payload=None, timeout=(5, 20)):
    cfg = _load_network_config()
    base_url = str(cfg.get("backend_url") or "").strip().rstrip("/")
    if not base_url:
        return {"ok": False, "error": "backend_url_empty"}
    url = urljoin(base_url + "/", path.lstrip("/"))
    try:
        response = requests.request(method=method.upper(), url=url, json=payload, timeout=timeout)
        data = response.json() if response.content else {}
        if response.status_code >= 400:
            return {"ok": False, "error": f"http_{response.status_code}", "details": data}
        return {"ok": True, "data": data}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _api_request_first_success(candidates):
    last_error = "unknown"
    for method, path, payload in candidates:
        res = _api_request(method, path, payload=payload)
        if res.get("ok"):
            return res
        last_error = res.get("error") or last_error
        if str(last_error).startswith("http_404"):
            continue
        return res
    return {"ok": False, "error": last_error}


def _detect_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


def _check_tcp_connect(host: str, port: int, timeout=2.5):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except Exception:
        return False


@eel.expose
def get_network_config():
    return _load_network_config()


@eel.expose
def save_network_config(backend_url, nickname="", active_room=""):
    cfg = _load_network_config()
    cfg["backend_url"] = str(backend_url or "").strip()
    cfg["nickname"] = str(nickname or "").strip()
    cfg["active_room"] = str(active_room or "").strip()
    cfg["api_prefix"] = str(cfg.get("api_prefix") or "/launcher").strip() or "/launcher"
    _save_network_config(cfg)
    return {"ok": True, "config": cfg}


@eel.expose
def create_network_room(room_name="", room_password="", nickname=""):
    payload = {
        "room_name": str(room_name or "").strip(),
        "password": str(room_password or "").strip(),
        "nickname": str(nickname or "").strip(),
    }
    if not payload["room_name"]:
        return {"ok": False, "error": "room_name_empty"}
    if not payload["nickname"]:
        return {"ok": False, "error": "nickname_empty"}

    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    result = _api_request_first_success([
        ("POST", f"{api_prefix}/rooms/create", payload),
        ("POST", f"{api_prefix}/rooms/{payload['room_name']}/create", payload),
        ("POST", f"{api_prefix}/rooms/{payload['room_name']}/join", payload),
        ("POST", "/chat/rooms/create", payload),
    ])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error")}
    data = result.get("data") or {}
    room_id = str(data.get("room_id") or data.get("room") or payload["room_name"]).strip()
    endpoint_payload = {
        "host_ip": _detect_local_ip(),
        "host_port": int(data.get("host_port") or 25565),
        "nickname": payload["nickname"],
    }
    _api_request_first_success([
        ("POST", f"{api_prefix}/rooms/{room_id}/host", endpoint_payload),
        ("POST", f"/chat/rooms/{room_id}/host", endpoint_payload),
    ])
    cfg = _load_network_config()
    cfg["active_room"] = room_id
    cfg["nickname"] = payload["nickname"]
    _save_network_config(cfg)
    return {"ok": True, "room_id": room_id, "data": data}


@eel.expose
def join_network_room(room_name="", room_password="", nickname=""):
    payload = {
        "room_name": str(room_name or "").strip(),
        "password": str(room_password or "").strip(),
        "nickname": str(nickname or "").strip(),
    }
    if not payload["room_name"]:
        return {"ok": False, "error": "room_name_empty"}
    if not payload["nickname"]:
        return {"ok": False, "error": "nickname_empty"}

    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    result = _api_request_first_success([
        ("POST", f"{api_prefix}/rooms/join", payload),
        ("POST", f"{api_prefix}/rooms/{payload['room_name']}/join", payload),
        ("POST", "/chat/rooms/join", payload),
    ])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error")}
    data = result.get("data") or {}
    room_id = str(data.get("room_id") or data.get("room") or payload["room_name"]).strip()
    cfg = _load_network_config()
    cfg["active_room"] = room_id
    cfg["nickname"] = payload["nickname"]
    _save_network_config(cfg)
    return {"ok": True, "room_id": room_id, "data": data}


@eel.expose
def get_network_peers(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty", "peers": []}
    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    result = _api_request_first_success([
        ("GET", f"{api_prefix}/rooms/{room}/peers", None),
        ("GET", f"/chat/rooms/{room}/peers", None),
    ])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error"), "peers": []}
    data = result.get("data") or {}
    peers = data.get("peers") if isinstance(data, dict) else []
    return {"ok": True, "peers": peers or [], "room_id": room}


@eel.expose
def get_room_endpoint(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty"}
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    result = _api_request_first_success([
        ("GET", f"{api_prefix}/rooms/{room}/endpoint", None),
        ("GET", f"/chat/rooms/{room}/endpoint", None),
    ])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error")}
    endpoint = (result.get("data") or {}).get("endpoint") or {}
    host = str(endpoint.get("host_ip") or "").strip()
    port = int(endpoint.get("host_port") or 25565)
    if not host:
        return {"ok": False, "error": "endpoint_missing"}
    return {"ok": True, "endpoint": {"host_ip": host, "host_port": port, "address": f"{host}:{port}"}}


@eel.expose
def test_room_connection(room_id=""):
    endpoint_res = get_room_endpoint(room_id)
    if not endpoint_res.get("ok"):
        return endpoint_res
    endpoint = endpoint_res["endpoint"]
    reachable = _check_tcp_connect(endpoint["host_ip"], endpoint["host_port"])
    return {"ok": True, "endpoint": endpoint, "reachable": reachable}


@eel.expose
def get_turn_credentials():
    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    result = _api_request_first_success([
        ("GET", f"{api_prefix}/turn-credentials", None),
        ("GET", "/turn-credentials", None),
    ])
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error")}
    data = result.get("data") or {}
    if not data.get("username") or not data.get("credential"):
        return {"ok": False, "error": "turn_credentials_invalid"}
    return {"ok": True, "turn": data}


@eel.expose
def get_connection_plan(room_id=""):
    probe = test_room_connection(room_id)
    if not probe.get("ok"):
        return probe
    if probe.get("reachable"):
        return {"ok": True, "mode": "direct", "endpoint": probe.get("endpoint")}
    turn = get_turn_credentials()
    if turn.get("ok"):
        return {
            "ok": True,
            "mode": "relay",
            "endpoint": probe.get("endpoint"),
            "turn": turn.get("turn"),
        }
    return {
        "ok": False,
        "error": "no_direct_no_relay",
        "endpoint": probe.get("endpoint"),
        "turn_error": turn.get("error"),
    }

def _download_file_to_target(url: str, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT) as response:
        response.raise_for_status()
        with open(target_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file.write(chunk)
                    
_PUBLIC_IP_ENDPOINTS = (
    "https://api.ipify.org?format=json",
    "https://ifconfig.co/json",
    "https://ipv4.icanhazip.com/",
)


def _detect_public_ip(timeout: float = 4.0) -> Optional[str]:
    for url in _PUBLIC_IP_ENDPOINTS:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "StoneLauncher/1.0"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", "ignore").strip()
                if not raw:
                    continue
                if raw.startswith("{"):
                    data = json.loads(raw)
                    ip = data.get("ip") or data.get("address")
                    if ip:
                        return ip.strip()
                else:
                    return raw.strip()
        except (urllib.error.URLError, socket.timeout, ValueError):
            continue
    return None


# --------------------------------------------------------------------------- #
# Internal: TCP-ping                                                          #
# --------------------------------------------------------------------------- #

def _tcp_ping(host: str, port: int, timeout: float = 2.0, attempts: int = 3) -> Optional[int]:
    """Return median TCP-handshake latency in ms, or None if all attempts failed."""
    if not host or not port:
        return None
    samples = []
    for _ in range(max(1, attempts)):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        t0 = time.perf_counter()
        try:
            sock.connect((host, int(port)))
            samples.append((time.perf_counter() - t0) * 1000.0)
        except (socket.timeout, OSError):
            pass
        finally:
            try:
                sock.close()
            except OSError:
                pass
    if not samples:
        return None
    samples.sort()
    return int(round(samples[len(samples) // 2]))


# --------------------------------------------------------------------------- #
# Public registration                                                         #
# --------------------------------------------------------------------------- #

def register_network_extensions(
    load_cfg: Callable[[], Dict[str, Any]],
    save_cfg: Callable[[Dict[str, Any]], None],
    *,
    _http_post: Optional[Callable[..., Any]] = None,
    _http_get: Optional[Callable[..., Any]] = None,
) -> None:
    """Attach extra eel methods that share the existing config helpers.

    Args:
        load_cfg: function that returns the current network config dict
                  (must contain at least 'backend_url' and may contain 'user_id'
                  and 'active_room').
        save_cfg: function that persists a config dict.
        _http_post: optional already-existing helper from data.py with
                    signature (path: str, body: dict, room_token: str | None) -> dict.
                    If provided, will be used to talk to the FastAPI backend.
        _http_get:  optional helper analogous to _http_post but for GET.
    """

    def _post(path: str, body: dict) -> dict:
        cfg = load_cfg() or {}
        backend = (cfg.get("backend_url") or "").rstrip("/")
        if not backend:
            return {"ok": False, "error": "backend_url not set"}
        if _http_post:
            try:
                return _http_post(path, body, cfg.get("room_token"))
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc)}
        # Fallback: direct urllib call
        url = f"{backend}{path if path.startswith('/') else '/' + path}"
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        token = cfg.get("room_token")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                payload = resp.read().decode("utf-8", "ignore")
                return json.loads(payload) if payload else {"ok": True}
        except urllib.error.HTTPError as exc:
            try:
                return json.loads(exc.read().decode("utf-8", "ignore"))
            except Exception:  # noqa: BLE001
                return {"ok": False, "error": f"HTTP {exc.code}"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    # ----------------------------------------------------------------- #
    # eel-exposed methods                                               #
    # ----------------------------------------------------------------- #

    @eel.expose
    def get_my_public_ip() -> dict:
        ip = _detect_public_ip()
        if not ip:
            return {"ok": False, "error": "could not detect public IP"}
        cfg = load_cfg() or {}
        cfg["last_public_ip"] = ip
        save_cfg(cfg)
        return {"ok": True, "ip": ip}

    @eel.expose
    def ping_address(host: str, port: int = 25565, attempts: int = 3) -> dict:
        if not host:
            return {"ok": False, "error": "host required"}
        ms = _tcp_ping(str(host), int(port or 25565), attempts=int(attempts or 3))
        if ms is None:
            return {"ok": True, "reachable": False, "ping_ms": None}
        return {"ok": True, "reachable": True, "ping_ms": ms}

    @eel.expose
    def set_local_minecraft_port(room_id: str, port: int) -> dict:
        try:
            port = int(port)
        except (TypeError, ValueError):
            return {"ok": False, "error": "invalid port"}
        if port < 1 or port > 65535:
            return {"ok": False, "error": "port out of range"}
        cfg = load_cfg() or {}
        room = (room_id or cfg.get("active_room") or "").strip()
        if not room:
            return {"ok": False, "error": "no active room"}

        # Make sure we know our public IP — backend will store it next to the port
        public_ip = cfg.get("last_public_ip") or _detect_public_ip()
        if public_ip:
            cfg["last_public_ip"] = public_ip

        cfg.setdefault("rooms", {}).setdefault(room, {})
        cfg["rooms"][room]["minecraft_port"] = port
        save_cfg(cfg)

        # Tell backend about the port + public IP so other peers see it.
        result = _post(
            "/rooms/announce",
            {
                "room_id": room,
                "user_id": cfg.get("user_id") or cfg.get("client_id") or "",
                "minecraft_port": port,
                "public_ip": public_ip or "",
            },
        )
        if isinstance(result, dict) and result.get("ok") is False:
            # Even if backend rejected, keep local copy — peers refresh on their side later.
            return {"ok": True, "warning": result.get("error", "backend rejected"),
                    "minecraft_port": port, "public_ip": public_ip}
        return {"ok": True, "minecraft_port": port, "public_ip": public_ip}

    @eel.expose
    def leave_network_room(room_id: str = "") -> dict:
        cfg = load_cfg() or {}
        room = (room_id or cfg.get("active_room") or "").strip()
        if not room:
            return {"ok": False, "error": "no active room"}
        result = _post(
            "/rooms/leave",
            {
                "room_id": room,
                "user_id": cfg.get("user_id") or cfg.get("client_id") or "",
            },
        )
        cfg["active_room"] = ""
        if "rooms" in cfg and room in cfg["rooms"]:
            cfg["rooms"].pop(room, None)
        save_cfg(cfg)
        if isinstance(result, dict) and result.get("ok") is False:
            return {"ok": True, "warning": result.get("error", "backend error")}
        return {"ok": True}

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