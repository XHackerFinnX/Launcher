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
import uuid
import ipaddress
from datetime import datetime
from urllib.parse import urljoin
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Optional
from functools import lru_cache

from db.database import create_connection
from db.tunnel_agent import TunnelAgent, RelayClientProxy, relay_smoke_test
from utils.config import minecraft_directory, VERSIONS_LAUNCHER
from utils.validators import is_valid_login, is_valid_server_address
from utils import ely

db_path = r"C:\.stoneworld\db\launcher.db"
log_path = r"C:\.stoneworld\logs\launcher.log"
REQUEST_TIMEOUT = (5, 20)
LAUNCHER_VERSION_URL = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher.json"
UPDATE_CHECK_TIMEOUT = (3, 5)
FILE_INTEGRITY_MANIFEST_URL = "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/launcher-file.json"
logger = logging.getLogger(__name__)
_log_viewer_process = None
NETWORK_CONFIG_PATH = Path(r"C:\.stoneworld\db\network.json")
_TUNNEL_AGENTS: Dict[str, TunnelAgent] = {}
_RELAY_UNSUPPORTED_CACHE: Dict[str, float] = {}
_RELAY_CLIENT_PROXIES: Dict[str, RelayClientProxy] = {}

def _get_remote_launcher_version() -> str:
    session = requests.Session()
    session.trust_env = False  # отключает системные Proxy Windows

    try:
        response = session.get(
            LAUNCHER_VERSION_URL,
            timeout=UPDATE_CHECK_TIMEOUT,
            headers={"User-Agent": "StoneLauncher/1.0"},
        )
        response.raise_for_status()

        data = response.json()
        version = str(data.get("version") or "").strip()
        return version

    except KeyboardInterrupt:
        logger.warning("Проверка версии лаунчера была прервана")
        return ""

    except requests.exceptions.Timeout:
        logger.warning("Таймаут при проверке версии лаунчера")
        return ""

    except requests.exceptions.RequestException as exc:
        logger.warning("Не удалось проверить версию лаунчера: %s", exc)
        return ""

    except ValueError:
        logger.warning("GitHub вернул некорректный JSON версии лаунчера")
        return ""

    except Exception as exc:
        logger.warning("Неожиданная ошибка проверки версии лаунчера: %s", exc)
        return ""

def _load_network_config():
    defaults = {
        "backend_url": "",
        "active_room": "",
        "nickname": "",
        "api_prefix": "/launcher",
        "user_id": "",
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

def _relay_room_request(room: str, action: str, payload=None):
    """Try known relay endpoint variants; cache 404 to avoid log spam."""
    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    cache_key = f"{api_prefix}:{room}:{action}"
    until = _RELAY_UNSUPPORTED_CACHE.get(cache_key, 0)
    if until and time.time() < until:
        return {"ok": False, "error": "relay_not_supported"}

    candidates = [
        ("POST", f"{api_prefix}/rooms/{room}/relay/session/{action}", payload),
        ("POST", f"/chat/rooms/{room}/relay/session/{action}", payload),
        ("POST", f"{api_prefix}/rooms/{room}/relay/{action}", payload),
    ]
    res = _api_request_first_success(candidates)
    if str(res.get("error","")).startswith("http_404"):
        _RELAY_UNSUPPORTED_CACHE[cache_key] = time.time() + 300
        return {"ok": False, "error": "relay_not_supported"}
    return res

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
    cfg["user_id"] = str(cfg.get("user_id") or cfg.get("client_id") or uuid.uuid4())
    _save_network_config(cfg)
    return {"ok": True, "config": cfg}


@eel.expose
def create_network_room(room_name="", room_password="", nickname=""):
    payload = {
        "room_name": str(room_name or "").strip(),
        "password": str(room_password or "").strip(),
        "nickname": str(nickname or "").strip(),
    }
    
    cfg = _load_network_config()
    payload["user_id"] = str(cfg.get("user_id") or cfg.get("client_id") or uuid.uuid4())
    if not payload["room_name"]:
        return {"ok": False, "error": "room_name_empty"}
    if not payload["nickname"]:
        return {"ok": False, "error": "nickname_empty"}

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
    published_port = int((cfg.get("rooms", {}).get(payload["room_name"], {}) or {}).get("minecraft_port") or data.get("host_port") or 25565)
    endpoint_payload = {
        "host_ip": _detect_public_ip() or _detect_local_ip(),
        "host_port": published_port,
        "nickname": payload["nickname"],
    }
    _api_request_first_success([
        ("POST", f"{api_prefix}/rooms/{room_id}/host", endpoint_payload),
        ("POST", f"/chat/rooms/{room_id}/host", endpoint_payload),
    ])
    cfg = _load_network_config()
    cfg["active_room"] = room_id
    cfg["nickname"] = payload["nickname"]
    cfg["user_id"] = payload["user_id"]
    _save_network_config(cfg)
    return {"ok": True, "room_id": room_id, "data": data}


@eel.expose
def join_network_room(room_name="", room_password="", nickname=""):
    payload = {
        "room_name": str(room_name or "").strip(),
        "password": str(room_password or "").strip(),
        "nickname": str(nickname or "").strip(),
    }
    
    cfg = _load_network_config()
    payload["user_id"] = str(cfg.get("user_id") or cfg.get("client_id") or uuid.uuid4())
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
    cfg["user_id"] = payload["user_id"]
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
    user_id = str(cfg.get("user_id") or cfg.get("client_id") or "").strip()
    if user_id:
        hb_payload = {
            "user_id": user_id,
            "nickname": str(cfg.get("nickname") or "Player"),
            "ping_ms": 0,
            "status": "Online",
            "online": True,
            "public_ip": str(cfg.get("last_public_ip") or ""),
            "lan_ip": _detect_local_ip(),
            "lan_port": 0,
            "minecraft_port": int((cfg.get("rooms", {}).get(room, {}) or {}).get("minecraft_port") or 0),
        }
        _api_request("POST", f"{api_prefix}/rooms/{room}/heartbeat", payload=hb_payload, timeout=(4, 8))
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
def set_local_minecraft_port(room_id: str = "", port: int = 0):
    try:
        port = int(port)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_port"}
    if port < 1 or port > 65535:
        return {"ok": False, "error": "port_out_of_range"}

    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty"}

    user_id = str(cfg.get("user_id") or cfg.get("client_id") or "").strip()
    if not user_id:
        user_id = str(uuid.uuid4())
        cfg["user_id"] = user_id

    public_ip = str(cfg.get("last_public_ip") or "").strip() or (_detect_public_ip() or "")
    if public_ip:
        cfg["last_public_ip"] = public_ip

    cfg.setdefault("rooms", {}).setdefault(room, {})
    cfg["rooms"][room]["minecraft_port"] = port
    _save_network_config(cfg)

    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")
    payload = {
        "user_id": user_id,
        "public_ip": public_ip,
        "minecraft_port": port,
    }
    result = _api_request("POST", f"{api_prefix}/rooms/{room}/announce-port", payload=payload, timeout=(5, 12))
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error", "announce_failed")}

    return {"ok": True, "room_id": room, "minecraft_port": port, "public_ip": public_ip}




@eel.expose
def get_my_public_ip():
    try:
        ip = _detect_public_ip()

        if not ip:
            cfg = _load_network_config()
            cached_ip = str(cfg.get("last_public_ip") or "").strip()

            if cached_ip:
                return {
                    "ok": True,
                    "ip": cached_ip,
                    "cached": True,
                    "warning": "Не удалось об��овить публичный IP, использован сохранённый."
                }

            return {
                "ok": False,
                "ip": "",
                "error": "public_ip_not_detected"
            }

        cfg = _load_network_config()
        cfg["last_public_ip"] = ip
        _save_network_config(cfg)

        return {
            "ok": True,
            "ip": ip,
            "cached": False
        }

    except Exception as exc:
        logger.exception("Ошибка get_my_public_ip")
        return {
            "ok": False,
            "ip": "",
            "error": str(exc) or "public_ip_error"
        }

@eel.expose
def get_my_lan_ip():
    return {"ok": True, "ip": _detect_local_ip()}


@eel.expose
def check_external_port(ip: str = "", port: int = 0):
    ip = str(ip or "").strip()
    try:
        port = int(port)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_port"}
    if not ip:
        return {"ok": False, "error": "ip_empty"}
    if port < 1 or port > 65535:
        return {"ok": False, "error": "port_out_of_range"}

    # External checker (public internet vantage point)
    try:
        resp = requests.post(
            "https://ports.yougetsignal.com/check-port.php",
            data={"remoteAddress": ip, "portNumber": str(port)},
            timeout=(5, 12),
            headers={"User-Agent": "StoneLauncher/1.0"},
        )
        data = resp.json() if resp.content else {}
        status = str(data.get("status", "")).lower()
        open_flag = str(data.get("portStatus", "")).lower() == "open" or status == "open"
        return {
            "ok": True,
            "ip": ip,
            "port": port,
            "is_open": bool(open_flag),
            "source": "yougetsignal",
            "raw": data,
        }
    except Exception as exc:
        return {"ok": False, "error": f"external_check_failed: {exc}"}

@eel.expose
def get_connection_plan(room_id=""):
    probe = test_room_connection(room_id)
    if not probe.get("ok"):
        return probe

    if probe.get("reachable"):
        return {
            "ok": True,
            "mode": "direct",
            "endpoint": probe.get("endpoint")
        }

    cfg = _load_network_config()
    api_prefix = "/" + str(cfg.get("api_prefix") or "/launcher").strip().strip("/")

    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty"}

    turn = get_turn_credentials()

    join_payload = {
        "user_id": str(cfg.get("user_id") or cfg.get("client_id") or "").strip()
    }

    relay_join = _relay_room_request(room, "join", payload=join_payload)

    if relay_join.get("ok"):
        r = relay_join.get("data") or {}
        room_key = str(room)

        old_proxy = _RELAY_CLIENT_PROXIES.get(room_key)
        if old_proxy:
            old_proxy.stop()

        local_port = 25595

        try:
            proxy = RelayClientProxy(
                relay_host=str(r.get("relay_host") or ""),
                relay_port=int(r.get("relay_port") or 0),
                room_id=room_key,
                join_token=str(r.get("join_token") or ""),
                local_port=local_port,
            )
            proxy.start()
            _RELAY_CLIENT_PROXIES[room_key] = proxy
        except Exception as exc:
            logger.exception("Не удалось запустить relay proxy")
            return {
                "ok": False,
                "error": f"relay_proxy_start_failed: {exc}"
            }

        return {
            "ok": True,
            "mode": "relay_tcp",
            "endpoint": {
                "host": "127.0.0.1",
                "port": local_port,
                "address": f"127.0.0.1:{local_port}",
            },
            "relay_endpoint": {
                "host": r.get("relay_host"),
                "port": r.get("relay_port"),
                "address": f"{r.get('relay_host')}:{r.get('relay_port')}",
            },
            "hint": "Direct недоступен, запущен локальный relay proxy 127.0.0.1.",
        }

    return {
        "ok": False,
        "error": "direct_unreachable_no_tcp_relay",
        "endpoint": probe.get("endpoint"),
        "turn_available": bool(turn.get("ok")),
        "turn_error": turn.get("error"),
        "relay_error": relay_join.get("error"),
        "hint": "Нужен VPN/туннель или встроенный TCP relay.",
    }
    
@eel.expose
def relay_server_smoke_test(relay_host="", relay_port=0):
    host = str(relay_host or "").strip()
    try:
        port = int(relay_port)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_port"}
    if not host or port < 1:
        return {"ok": False, "error": "invalid_host_or_port"}
    return relay_smoke_test(host, port)


@eel.expose
def start_tunnel_agent(room_id="", minecraft_port=0):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty"}
    try:
        mc_port = int(minecraft_port)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_minecraft_port"}
    if mc_port < 1 or mc_port > 65535:
        return {"ok": False, "error": "minecraft_port_out_of_range"}

    payload = {
        "user_id": str(cfg.get("user_id") or "").strip(),
        "minecraft_port": mc_port,
    }
    res = _relay_room_request(room, "open", payload=payload)
    if not res.get("ok"):
        return res
    data = res.get("data") or {}
    relay_host = str(data.get("relay_host") or "").strip()
    relay_port = int(data.get("relay_port") or 0)
    agent_token = str(data.get("agent_token") or "").strip()
    if not (relay_host and relay_port and agent_token):
        return {"ok": False, "error": "relay_open_response_invalid", "data": data}

    old = _TUNNEL_AGENTS.get(room)
    if old:
        old.stop()

    agent = TunnelAgent(relay_host=relay_host, relay_port=relay_port, agent_token=agent_token, minecraft_port=mc_port, room_id=room)
    agent.start()
    _TUNNEL_AGENTS[room] = agent
    return {"ok": True, "room_id": room, "status": agent.status(), "relay": {"host": relay_host, "port": relay_port}}


@eel.expose
def stop_tunnel_agent(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    agent = _TUNNEL_AGENTS.get(room)
    if not agent:
        return {"ok": True, "room_id": room, "status": "not_running"}
    agent.stop()
    _TUNNEL_AGENTS.pop(room, None)
    proxy = _RELAY_CLIENT_PROXIES.get(room)
    if proxy:
        proxy.stop()
        _RELAY_CLIENT_PROXIES.pop(room, None)
    cfg = _load_network_config()
    _relay_room_request(room, "close", payload={"user_id": str(cfg.get("user_id") or "").strip()})
    return {"ok": True, "room_id": room, "status": "stopped"}


@eel.expose
def get_tunnel_agent_status(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    agent = _TUNNEL_AGENTS.get(room)
    if not agent:
        return {"ok": True, "room_id": room, "running": False, "status": "idle"}
    return {"ok": True, "room_id": room, "running": True, **agent.status()}

def _download_file_to_target(url: str, target_path: Path) -> None:
    url = str(url or "").strip()

    if not url.startswith("https://"):
        raise ValueError("Разрешены только HTTPS-ссылки для скачивания файлов")

    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")

    session = requests.Session()
    session.trust_env = False

    try:
        with session.get(
            url,
            stream=True,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "StoneLauncher/1.0"},
        ) as response:
            response.raise_for_status()

            with tmp_path.open("wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        file.write(chunk)

        tmp_path.replace(target_path)

    except Exception:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
        raise
                    
_PUBLIC_IP_ENDPOINTS = (
    "https://api.ipify.org?format=json",
    "https://ifconfig.co/json",
    "https://ipv4.icanhazip.com/",
)

def _is_valid_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(str(value).strip())
        return (
            ip.version == 4
            and not ip.is_private
            and not ip.is_loopback
            and not ip.is_reserved
            and not ip.is_multicast
            and not ip.is_link_local
        )
    except ValueError:
        return False

def _detect_public_ip(timeout: float = 4.0) -> Optional[str]:
    """
    Безопасно получает публичный IPv4.
    Не использует системные Proxy Windows, чтобы не зависать в proxy_bypass_registry.
    """
    session = requests.Session()
    session.trust_env = False

    for url in _PUBLIC_IP_ENDPOINTS:
        try:
            response = session.get(
                url,
                timeout=(3, timeout),
                headers={"User-Agent": "StoneLauncher/1.0"},
            )
            response.raise_for_status()

            raw = response.text.strip()
            if not raw:
                continue

            if raw.startswith("{"):
                data = response.json()
                ip = str(data.get("ip") or data.get("address") or "").strip()
            else:
                ip = raw.strip()

            if _is_valid_public_ip(ip):
                return ip

        except (
            requests.exceptions.RequestException,
            ValueError,
            KeyError,
            TypeError,
            socket.timeout,
            socket.gaierror,
            socket.herror,
            TimeoutError,
            OSError,
        ) as exc:
            logger.warning("Не удалось получить публичный IP через %s: %s", url, exc)
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
    def get_my_public_ip():
        try:
            ip = _detect_public_ip()

            if not ip:
                cfg = _load_network_config()
                cached_ip = str(cfg.get("last_public_ip") or "").strip()

                if cached_ip:
                    return {
                        "ok": True,
                        "ip": cached_ip,
                        "cached": True,
                        "warning": "Не удалось обновить публичный IP, использован сохранённый."
                    }

                return {
                    "ok": False,
                    "ip": "",
                    "error": "public_ip_not_detected"
                }

            cfg = _load_network_config()
            cfg["last_public_ip"] = ip
            _save_network_config(cfg)

            return {
                "ok": True,
                "ip": ip,
                "cached": False
            }

        except Exception as exc:
            logger.exception("Ошибка get_my_public_ip")
            return {
                "ok": False,
                "ip": "",
                "error": str(exc) or "public_ip_error"
            }

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
            f"/launcher/rooms/{room}/announce-port",
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
            f"/launcher/rooms/{room}/leave?user_id={(cfg.get('user_id') or cfg.get('client_id') or '')}",
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
    """Добавление нового offline-аккаунта в таблицу."""
    login = str(login or "").strip()
    if not is_valid_login(login):
        logger.warning("Отклонен некорректный логин: %s", login)
        return False
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """INSERT OR IGNORE INTO accounts
           (login, choose, account_type, uuid, access_token, client_token, skin_url, profile_json)
           VALUES (?, 0, 'offline', '', '', '', '', '{}')""",
        (login,),
    )
    inserted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return inserted

def _account_row_to_dict(row):
    return {
        "id": row[0],
        "login": row[1],
        "choose": row[2] or 0,
        "account_type": row[3] or "offline",
        "uuid": row[4] or "",
        "access_token": row[5] or "",
        "client_token": row[6] or "",
        "skin_url": (row[7] or "").replace(
            "https://skinsystem.ely.by", "http://skinsystem.ely.by"
        ),
        "profile_json": row[8] or "{}",
    }


def _selected_profile_from_ely_response(data: dict) -> dict:
    profile = data.get("selectedProfile") or {}
    if not profile:
        profiles = data.get("availableProfiles") or []
        profile = profiles[0] if profiles else {}
    return profile


@eel.expose
def add_ely_account(username, password):
    """Авторизует Ely.by-аккаунт и сохраняет токен без хранения пароля."""
    username = str(username or "").strip()
    password = str(password or "")
    if not username or not password:
        return {"ok": False, "error": "Укажите логин и пароль Ely.by"}

    client_token = str(uuid.uuid4())
    try:
        auth_data = ely.authenticate(username, password, client_token)
        profile = _selected_profile_from_ely_response(auth_data)
        login = str(profile.get("name") or username).strip()
        profile_uuid = str(profile.get("id") or "").strip()
        access_token = str(auth_data.get("accessToken") or "").strip()
        if not login or not access_token:
            return {"ok": False, "error": "Ely.by не вернул профиль игрока"}
        if not is_valid_login(login):
            return {"ok": False, "error": "Ник Ely.by не подходит под формат Minecraft"}

        skin = ely.skin_url(login)
        conn = create_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""UPDATE accounts SET choose = 0""")
        cursor.execute(
            """INSERT INTO accounts
               (login, choose, account_type, uuid, access_token, client_token, skin_url, profile_json)
               VALUES (?, 1, 'ely', ?, ?, ?, ?, ?)
               ON CONFLICT(login) DO UPDATE SET
                   account_type='ely',
                   uuid=excluded.uuid,
                   access_token=excluded.access_token,
                   client_token=excluded.client_token,
                   skin_url=excluded.skin_url,
                   profile_json=excluded.profile_json,
                   choose=1""",
            (
                login,
                profile_uuid,
                access_token,
                client_token,
                skin,
                json.dumps(auth_data, ensure_ascii=False),
            ),
        )
        conn.commit()
        conn.close()
        return {
            "ok": True,
            "account": {
                "login": login,
                "account_type": "ely",
                "uuid": profile_uuid,
                "skin_url": skin,
            },
        }
    except Exception as exc:
        logger.exception("Ошибка авторизации Ely.by")
        return {"ok": False, "error": str(exc) or "Ошибка авторизации Ely.by"}


@eel.expose
def refresh_ely_account(login):
    account = get_account_by_login(login, include_token=True)
    if not account or account.get("account_type") != "ely":
        return {"ok": False, "error": "ely_account_not_found"}
    try:
        data = ely.refresh(account.get("access_token") or "", account.get("client_token") or "")
        profile = _selected_profile_from_ely_response(data)
        new_login = str(profile.get("name") or account.get("login") or "").strip()
        access_token = str(data.get("accessToken") or account.get("access_token") or "").strip()
        conn = create_connection(db_path)
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE accounts SET login=?, uuid=?, access_token=?, skin_url=?, profile_json=?
               WHERE id=?""",
            (
                new_login,
                str(profile.get("id") or account.get("uuid") or ""),
                access_token,
                ely.skin_url(new_login),
                json.dumps(data, ensure_ascii=False),
                account["id"],
            ),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "login": new_login, "skin_url": ely.skin_url(new_login)}
    except Exception as exc:
        logger.exception("Не удалось обновить Ely.by токен")
        return {"ok": False, "error": str(exc)}

@eel.expose
def delete_account(login):
    """Удаление аккаунта из базы данных."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""DELETE FROM accounts WHERE login = ?""", (login,))
    conn.commit()
    conn.close()

@eel.expose
def get_accounts():
    """Получение всех аккаунтов из базы данных."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, login, choose, account_type, uuid, access_token, client_token, skin_url, profile_json
           FROM accounts
           ORDER BY choose DESC, account_type DESC, login COLLATE NOCASE"""
    )
    account_list = [_account_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    for account in account_list:
        account.pop("access_token", None)
    return account_list

def get_account_by_login(login, include_token=False):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """SELECT id, login, choose, account_type, uuid, access_token, client_token, skin_url, profile_json
           FROM accounts WHERE login = ?""",
        (login,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    account = _account_row_to_dict(row)
    if not include_token:
        account.pop("access_token", None)
    return account


def get_account_for_launch(login):
    return get_account_by_login(login, include_token=True)

@lru_cache(maxsize=128)
def _cached_ely_skin_face(login):
    return ely.skin_face_data_uri(login)


@eel.expose
def get_ely_skin_face(login):
    """Возвращает вырезанное лицо Minecraft-скина Ely.by как PNG data URI."""
    login = str(login or "").strip()
    if not is_valid_login(login):
        return {"ok": False, "error": "Некорректный ник Minecraft"}
    try:
        return {"ok": True, "face": _cached_ely_skin_face(login)}
    except Exception as exc:
        logger.exception("Не удалось получить лицо скина Ely.by для %s", login)
        return {"ok": False, "error": str(exc) or "Не удалось получить лицо скина"}

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

        if not _is_safe_target_path(target_path):
            logger.warning("Небезопасный путь установки файла: %s", target_path)
            summary["checked"] = index
            try:
                eel.updateIntegrityProgress({
                    "checked": index,
                    "total": total,
                    "status": "skipped",
                    "file": file_name,
                    "message": "Файл пропущен: небезопасный путь установки."
                })
            except Exception:
                logger.debug("Не удалось отправить прогресс проверки в UI", exc_info=True)
            continue
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

def _is_safe_target_path(target_path: Path) -> bool:
    allowed_roots = [
        Path(r"C:\.stoneworld").resolve(),
        Path(minecraft_directory).resolve(),
    ]

    try:
        resolved = target_path.resolve()
    except OSError:
        return False

    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue

    return False

def _is_safe_target_path(target_path: Path) -> bool:
    allowed_roots = [
        Path(r"C:\.stoneworld").resolve(),
        Path(minecraft_directory).resolve(),
    ]

    try:
        resolved = target_path.resolve()
    except OSError:
        return False

    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue

    return False
    
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
    try:
        conn = create_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""SELECT version FROM launcher""")
        launcher = cursor.fetchall()
        conn.close()

        local_version = str(launcher[0][0]) if launcher else ""
        remote_version = _get_remote_launcher_version()

        if not remote_version:
            return False

        return local_version != remote_version

    except KeyboardInterrupt:
        logger.warning("check_version_launcher был прерван")
        return False

    except Exception:
        logger.exception("Ошибка check_version_launcher")
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
    version = _get_remote_launcher_version()

    if not version:
        return False

    try:
        conn = create_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""UPDATE launcher SET version = ?""", (version,))
        conn.commit()
        conn.close()
        return True

    except Exception:
        logger.exception("Не удалось сохранить последнюю версию лаунчера")
        return False

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
        return [{"provider":"modrinth","project_id":h.get('project_id'),"slug":h.get('slug'),"title":h.get('title'),"description":h.get('description'),"icon":h.get('icon_url'),"downloads":h.get('downloads',0),"author":h.get('author'),"url":f"https://modrinth.com/mod/{h.get('slug') or h.get('project_id')}"} for h in hits]
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

# ---------- Custom modpacks ----------
def _normalize_loader(loader):
    loader = str(loader or "").strip().lower()
    return loader if loader in {"forge", "fabric"} else ""


def _custom_build_id(name, game_version, loader):
    safe_name = " ".join(str(name or "").strip().split())
    loader_label = "Fabric" if loader == "fabric" else "Forge"
    return f"{safe_name} {loader_label} {game_version}".strip()


def _ensure_custom_modpacks_table(cursor):
    cursor.execute('''CREATE TABLE IF NOT EXISTS custom_modpacks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        build_id TEXT NOT NULL UNIQUE,
                        name TEXT NOT NULL UNIQUE,
                        description TEXT DEFAULT '',
                        game_version TEXT NOT NULL,
                        loader TEXT NOT NULL,
                        provider TEXT DEFAULT 'modrinth',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP)''')


@eel.expose
def get_available_loaders(game_version):
    game_version = str(game_version or "").strip()
    loaders = []
    if not game_version:
        return loaders
    try:
        if minecraft_launcher_lib.forge.find_forge_version(game_version):
            loaders.append("forge")
    except Exception:
        logger.debug("Не удалось проверить Forge для %s", game_version, exc_info=True)
    try:
        if minecraft_launcher_lib.fabric.is_minecraft_version_supported(game_version):
            loaders.append("fabric")
    except Exception:
        logger.debug("Не удалось проверить Fabric для %s", game_version, exc_info=True)
    return loaders


@eel.expose
def save_custom_modpack(payload):
    payload = payload or {}
    name = " ".join(str(payload.get("name") or "").strip().split())
    description = str(payload.get("description") or payload.get("desc") or "").strip()
    game_version = str(payload.get("version") or payload.get("game_version") or "").strip()
    loader = _normalize_loader(payload.get("loader"))
    provider = str(payload.get("provider") or "modrinth").strip().lower() or "modrinth"
    edit_id = str(payload.get("id") or payload.get("build_id") or "").strip()

    if not name:
        return {"ok": False, "error": "Укажите название сборки"}
    if not game_version:
        return {"ok": False, "error": "Выберите версию Minecraft"}
    if not loader:
        return {"ok": False, "error": "Выберите Forge или Fabric"}
    if provider != "modrinth":
        provider = "modrinth"

    build_id = edit_id or _custom_build_id(name, game_version, loader)
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_custom_modpacks_table(cursor)
    try:
        if edit_id:
            cursor.execute(
                """
                UPDATE custom_modpacks
                SET description = ?, provider = ?, updated_at = CURRENT_TIMESTAMP
                WHERE build_id = ?
                """,
                (description, provider, edit_id),
            )
            if cursor.rowcount == 0:
                return {"ok": False, "error": "Сборка не найдена"}
        else:
            cursor.execute(
                """
                INSERT INTO custom_modpacks (build_id, name, description, game_version, loader, provider)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (build_id, name, description, game_version, loader, provider),
            )
        conn.commit()
        return {
            "ok": True,
            "build": {
                "id": build_id,
                "build_id": build_id,
                "name": name,
                "description": description,
                "version": game_version,
                "loader": loader,
                "provider": provider,
            },
        }
    except Exception as exc:
        conn.rollback()
        logger.exception("Не удалось сохранить кастомную сборку")
        message = "Сборка с таким названием уже существует" if "UNIQUE" in str(exc).upper() else str(exc)
        return {"ok": False, "error": message}
    finally:
        conn.close()


@eel.expose
def get_custom_modpacks():
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_custom_modpacks_table(cursor)
    cursor.execute(
        """
        SELECT build_id, name, description, game_version, loader, provider
        FROM custom_modpacks
        ORDER BY updated_at DESC, id DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "build_id": row[0],
            "name": row[1],
            "description": row[2] or "",
            "version": row[3],
            "loader": row[4],
            "provider": row[5] or "modrinth",
        }
        for row in rows
    ]


@eel.expose
def get_custom_modpack(build_id):
    build_id = str(build_id or "").strip()
    if not build_id:
        return None
    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_custom_modpacks_table(cursor)
    cursor.execute(
        """
        SELECT build_id, name, description, game_version, loader, provider
        FROM custom_modpacks
        WHERE build_id = ?
        """,
        (build_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "build_id": row[0],
        "name": row[1],
        "description": row[2] or "",
        "version": row[3],
        "loader": row[4],
        "provider": row[5] or "modrinth",
    }


@eel.expose
def delete_custom_modpack(build_id):
    """Полностью удаляет кастомную сборку: запись в БД, установленную версию и файлы."""
    build_id = str(build_id or "").strip()
    if not build_id:
        return {"ok": False, "error": "Не указан идентификатор сборки"}

    # Удаляем папку установленной версии (если установлена) и запись из списка версий.
    try:
        delete_versions_list(build_id)
    except Exception:
        logger.debug("Не удалось удалить файлы сборки %s", build_id, exc_info=True)

    conn = create_connection(db_path)
    cursor = conn.cursor()
    _ensure_custom_modpacks_table(cursor)
    try:
        cursor.execute("DELETE FROM custom_modpacks WHERE build_id = ?", (build_id,))
        conn.commit()
        return {"ok": True}
    except Exception as exc:
        conn.rollback()
        logger.exception("Не удалось удалить кастомную сборку %s", build_id)
        return {"ok": False, "error": str(exc)}
    finally:
        conn.close()


@eel.expose
def delete_installed_mod(version_name, mod_name):
    mods_path = _mods_dir(version_name)
    target = mods_path / Path(str(mod_name or "")).name
    if not target.exists() or target.suffix.lower() != ".jar":
        return {"ok": False, "error": "Мод не найден"}
    target.unlink()
    return {"ok": True}


# ---------- Resource packs & shaders ----------
def _resourcepacks_dir(version_name):
    return Path(minecraft_directory) / version_name / "resourcepacks"


def _shaderpacks_dir(version_name):
    return Path(minecraft_directory) / version_name / "shaderpacks"


_CONTENT_DIRS = {
    "mod": (_mods_dir, (".jar",)),
    "resourcepack": (_resourcepacks_dir, (".zip",)),
    "shader": (_shaderpacks_dir, (".zip",)),
}

_PROJECT_TYPE_FACET = {
    "mod": "mod",
    "resourcepack": "resourcepack",
    "shader": "shader",
}


def _content_dir(content_type, version_name):
    resolver, _ = _CONTENT_DIRS.get(content_type, (_mods_dir, (".jar",)))
    return resolver(version_name)


@eel.expose
def list_installed_content(content_type, version_name):
    """Список установленных модов/ресурспаков/шейдеров для сборки."""
    content_type = str(content_type or "mod").lower()
    resolver, exts = _CONTENT_DIRS.get(content_type, (_mods_dir, (".jar",)))
    path = resolver(version_name)
    if not path.exists():
        return []
    out = []
    for file in sorted(path.iterdir()):
        if file.is_file() and file.suffix.lower() in exts:
            out.append({"name": file.name, "size": file.stat().st_size})
    return out


_ALLOWED_SEARCH_INDEXES = {"relevance", "downloads", "follows", "newest", "updated"}


@eel.expose
def search_content(content_type, query, game_version, loader, limit=24, index='relevance', offset=0, categories=None):
    """Поиск контента на Modrinth с фильтром по типу проекта, пагинацией и категориями."""
    content_type = str(content_type or "mod").lower()
    project_type = _PROJECT_TYPE_FACET.get(content_type, "mod")
    query = query or ''
    game_version = str(game_version or '').strip()
    loader = str(loader or '').strip()
    limit = max(1, min(int(limit or 24), 50))
    try:
        offset = max(0, int(offset or 0))
    except (TypeError, ValueError):
        offset = 0
    index = str(index or 'relevance').strip().lower()
    if index not in _ALLOWED_SEARCH_INDEXES:
        index = 'relevance'

    # Категории фильтра приходят списком или строкой через запятую.
    if isinstance(categories, str):
        categories = [c.strip() for c in categories.split(',') if c.strip()]
    categories = [str(c).strip() for c in (categories or []) if str(c).strip()]

    facets = [f'["project_type:{project_type}"]']
    if game_version:
        facets.append(f'["versions:{game_version}"]')
    # Загрузчик важен только для модов; ресурспаки/шейдеры от него не зависят.
    if loader and content_type == "mod":
        facets.append(f'["categories:{loader}"]')
    for category in categories:
        # Защита от инъекций в facets — пропускаем только безопасные символы.
        safe = ''.join(ch for ch in category if ch.isalnum() or ch in {'-', '_'})
        if safe:
            facets.append(f'["categories:{safe}"]')
    facets_str = '[' + ','.join(facets) + ']'

    url = "https://api.modrinth.com/v2/search"
    params = {"query": query, "limit": limit, "offset": offset, "index": index, "facets": facets_str}
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
    except Exception as exc:
        logger.exception("Ошибка поиска контента Modrinth")
        return {"ok": False, "error": str(exc), "results": [], "total": 0, "offset": offset}
    payload = r.json()
    hits = payload.get('hits', [])
    total = payload.get('total_hits', 0)
    url_kind = {"mod": "mod", "resourcepack": "resourcepack", "shader": "shader"}.get(content_type, "mod")
    results = [
        {
            "provider": "modrinth",
            "project_id": h.get('project_id'),
            "slug": h.get('slug'),
            "title": h.get('title'),
            "description": h.get('description'),
            "icon": h.get('icon_url'),
            "downloads": h.get('downloads', 0),
            "follows": h.get('follows', 0),
            "author": h.get('author'),
            "categories": h.get('categories', []),
            "client_side": h.get('client_side'),
            "server_side": h.get('server_side'),
            "date_modified": h.get('date_modified'),
            "url": f"https://modrinth.com/{url_kind}/{h.get('slug') or h.get('project_id')}",
        }
        for h in hits
    ]
    has_more = (offset + len(results)) < total
    return {"ok": True, "results": results, "total": total, "offset": offset, "has_more": has_more}


@eel.expose
def install_content(content_type, provider, project_id, version_name, game_version, loader):
    """Установка мода/ресурспака/шейдера в папку соответствующей сборки."""
    content_type = str(content_type or "mod").lower()
    resolver, exts = _CONTENT_DIRS.get(content_type, (_mods_dir, (".jar",)))
    target_dir = resolver(version_name)
    target_dir.mkdir(parents=True, exist_ok=True)

    if (provider or "modrinth").lower() != 'modrinth':
        return {"ok": False, "error": "Провайдер пока не поддерживается"}

    url = f"https://api.modrinth.com/v2/project/{project_id}/version"
    try:
        r = requests.get(url, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
    except Exception as exc:
        logger.exception("Ошибка получения версий проекта %s", project_id)
        return {"ok": False, "error": str(exc)}

    versions = r.json()
    selected = None
    fallback = None
    for ver in versions:
        if game_version and game_version not in ver.get('game_versions', []):
            continue
        # Для ресурспаков и шейдеров фильтр по загрузчику не применяем.
        if content_type == "mod" and loader and loader not in ver.get('loaders', []):
            continue
        selected = ver
        break
    if not selected:
        # Версия мода под точную версию игры не найдена — пробуем любую совместимую по загрузчику.
        for ver in versions:
            if content_type == "mod" and loader and loader not in ver.get('loaders', []):
                continue
            fallback = ver
            break
    chosen = selected or fallback
    if not chosen:
        return {"ok": False, "error": "Не найдена подходящая версия"}

    files = chosen.get('files', [])
    file_obj = next((f for f in files if f.get('primary')), None) or (files[0] if files else None)
    if not file_obj:
        return {"ok": False, "error": "Файл отсутствует"}

    filename = Path(str(file_obj.get('filename') or "")).name
    if not filename:
        return {"ok": False, "error": "Некорректное имя файла"}
    target = target_dir / filename
    # Проверяем, не установлен ли уже этот файл, чтобы не было дублей.
    if target.exists():
        return {
            "ok": True,
            "name": filename,
            "size": target.stat().st_size,
            "exact": selected is not None,
            "already_installed": True,
            "installed_at": datetime.utcnow().isoformat(),
        }
    try:
        _download_file_to_target(file_obj.get('url'), target)
    except Exception as exc:
        logger.exception("Ошибка загрузки контента %s", filename)
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "name": filename,
        "size": target.stat().st_size,
        "exact": selected is not None,
        "already_installed": False,
        "installed_at": datetime.utcnow().isoformat(),
    }


@eel.expose
def get_content_filters(content_type):
    """Возвращает доступные категории/фильтры Modrinth для типа контента."""
    content_type = str(content_type or "mod").lower()
    project_type = _PROJECT_TYPE_FACET.get(content_type, "mod")
    try:
        r = requests.get("https://api.modrinth.com/v2/tag/category", timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
    except Exception as exc:
        logger.exception("Не удалось получить категории Modrinth")
        return {"ok": False, "error": str(exc), "categories": []}
    loader_names = {"forge", "fabric", "quilt", "neoforge", "liteloader", "modloader", "rift", "bukkit", "spigot", "paper", "purpur", "sponge", "bungeecord", "velocity", "folia", "datapack", "minecraft"}
    categories = []
    for tag in r.json():
        if tag.get("project_type") != project_type:
            continue
        name = tag.get("name")
        if not name or name in loader_names:
            continue
        categories.append({"name": name, "header": tag.get("header", "")})
    return {"ok": True, "categories": categories}


def _resolve_modrinth_version(project_id, game_version, loader, content_type="mod"):
    """Подбирает подходящую версию проекта Modrinth и возвращает (version_dict|None)."""
    url = f"https://api.modrinth.com/v2/project/{project_id}/version"
    r = requests.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    versions = r.json()
    selected = None
    fallback = None
    for ver in versions:
        if game_version and game_version not in ver.get('game_versions', []):
            continue
        if content_type == "mod" and loader and loader not in ver.get('loaders', []):
            continue
        selected = ver
        break
    if not selected:
        for ver in versions:
            if content_type == "mod" and loader and loader not in ver.get('loaders', []):
                continue
            fallback = ver
            break
    return selected or fallback


@eel.expose
def resolve_content_dependencies(content_type, project_id, version_name, game_version, loader):
    """Определяет обязательные зависимости мода и помечает уже установленные."""
    content_type = str(content_type or "mod").lower()
    resolver, exts = _CONTENT_DIRS.get(content_type, (_mods_dir, (".jar",)))
    target_dir = resolver(version_name)
    installed_files = set()
    if target_dir.exists():
        installed_files = {
            f.name.lower()
            for f in target_dir.iterdir()
            if f.is_file() and f.suffix.lower() in exts
        }

    try:
        chosen = _resolve_modrinth_version(project_id, game_version, loader, content_type)
    except Exception as exc:
        logger.exception("Ошибка получения версий проекта %s", project_id)
        return {"ok": False, "error": str(exc), "dependencies": []}
    if not chosen:
        return {"ok": True, "dependencies": []}

    dep_project_ids = []
    for dep in chosen.get('dependencies', []):
        if dep.get('dependency_type') != 'required':
            continue
        pid = dep.get('project_id')
        if pid:
            dep_project_ids.append(pid)

    dependencies = []
    seen = set()
    for pid in dep_project_ids:
        if pid in seen:
            continue
        seen.add(pid)
        try:
            proj = requests.get(f"https://api.modrinth.com/v2/project/{pid}", timeout=REQUEST_TIMEOUT)
            proj.raise_for_status()
            proj_data = proj.json()
        except Exception:
            logger.debug("Не удалось получить данные зависимости %s", pid, exc_info=True)
            continue

        already = False
        try:
            dep_ver = _resolve_modrinth_version(pid, game_version, loader, content_type)
            if dep_ver:
                files = dep_ver.get('files', [])
                file_obj = next((f for f in files if f.get('primary')), None) or (files[0] if files else None)
                if file_obj:
                    fname = Path(str(file_obj.get('filename') or "")).name.lower()
                    if fname and fname in installed_files:
                        already = True
        except Exception:
            logger.debug("Не удалось проверить установку зависимости %s", pid, exc_info=True)

        dependencies.append({
            "project_id": pid,
            "slug": proj_data.get('slug'),
            "title": proj_data.get('title') or pid,
            "description": proj_data.get('description') or "",
            "icon": proj_data.get('icon_url'),
            "downloads": proj_data.get('downloads', 0),
            "already_installed": already,
            "url": f"https://modrinth.com/mod/{proj_data.get('slug') or pid}",
        })

    return {"ok": True, "dependencies": dependencies}


@eel.expose
def delete_installed_content(content_type, version_name, item_name):
    """Удаление установленного мода/ресурспака/шейдера."""
    content_type = str(content_type or "mod").lower()
    resolver, exts = _CONTENT_DIRS.get(content_type, (_mods_dir, (".jar",)))
    path = resolver(version_name)
    target = path / Path(str(item_name or "")).name
    if not target.exists() or target.suffix.lower() not in exts:
        return {"ok": False, "error": "Файл не найден"}
    try:
        target.unlink()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}
