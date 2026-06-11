import ipaddress
import json
import logging
import socket
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import urljoin

import eel
import requests

from db.tunnel_agent import TunnelAgent, RelayClientProxy, relay_smoke_test

logger = logging.getLogger(__name__)

NETWORK_CONFIG_PATH = Path(r"C:\.stoneworld\db\network.json")
DEFAULT_NETWORK_BACKEND_URL = "https://2p2p.ru"
DEFAULT_NETWORK_API_PREFIX = "/launcher"
DEFAULT_RELAY_LOCAL_PORT = 25595
_TUNNEL_AGENTS: Dict[str, TunnelAgent] = {}
_RELAY_UNSUPPORTED_CACHE: Dict[str, float] = {}
_RELAY_CLIENT_PROXIES: Dict[str, RelayClientProxy] = {}

def _load_network_config():
    defaults = {
        "backend_url": DEFAULT_NETWORK_BACKEND_URL,
        "active_room": "",
        "nickname": "",
        "api_prefix": DEFAULT_NETWORK_API_PREFIX,
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
    base_url = str(cfg.get("backend_url") or DEFAULT_NETWORK_BACKEND_URL).strip().rstrip("/")
    if not base_url:
        return {"ok": False, "error": "backend_url_empty"}

    # Users sometimes paste https://2p2p.ru/launcher into the backend field.
    # The launcher stores API prefix separately, so strip the duplicate suffix
    # to avoid https://2p2p.ru/launcher/launcher/... requests.
    api_prefix = "/" + str(cfg.get("api_prefix") or DEFAULT_NETWORK_API_PREFIX).strip().strip("/")
    if api_prefix != "/" and base_url.lower().endswith(api_prefix.lower()):
        base_url = base_url[: -len(api_prefix)].rstrip("/")

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


def _pick_available_local_port(preferred_port: int = DEFAULT_RELAY_LOCAL_PORT) -> int:
    for port in range(int(preferred_port), min(65535, int(preferred_port) + 25) + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError(f"no free local relay port near {preferred_port}")


def _start_client_proxy_from_relay_join(room: str, relay_data: dict, local_port: int = DEFAULT_RELAY_LOCAL_PORT):
    room_key = str(room)
    relay_host = str(relay_data.get("relay_host") or "").strip()
    relay_port = int(relay_data.get("relay_port") or 0)
    join_token = str(relay_data.get("join_token") or "").strip()
    if not (relay_host and relay_port and join_token):
        return {"ok": False, "error": "relay_join_response_invalid", "data": relay_data}

    old_proxy = _RELAY_CLIENT_PROXIES.get(room_key)
    if old_proxy:
        old_proxy.stop()

    picked_port = _pick_available_local_port(local_port)
    proxy = RelayClientProxy(
        relay_host=relay_host,
        relay_port=relay_port,
        room_id=room_key,
        join_token=join_token,
        local_port=picked_port,
    )
    proxy.start()
    _RELAY_CLIENT_PROXIES[room_key] = proxy
    return {
        "ok": True,
        "room_id": room_key,
        "mode": "relay_tcp",
        "status": proxy.status(),
        "endpoint": {
            "host": "127.0.0.1",
            "port": picked_port,
            "address": f"127.0.0.1:{picked_port}",
        },
        "relay_endpoint": {
            "host": relay_host,
            "port": relay_port,
            "address": f"{relay_host}:{relay_port}",
        },
        "hint": "Локальный relay proxy запущен. В Minecraft подключайтесь к endpoint.address.",
    }


@eel.expose
def get_network_config():
    return _load_network_config()


@eel.expose
def save_network_config(backend_url, nickname="", active_room=""):
    cfg = _load_network_config()
    cfg["backend_url"] = str(backend_url or DEFAULT_NETWORK_BACKEND_URL).strip().rstrip("/")
    cfg["nickname"] = str(nickname or "").strip()
    cfg["active_room"] = str(active_room or "").strip()
    cfg["api_prefix"] = str(cfg.get("api_prefix") or DEFAULT_NETWORK_API_PREFIX).strip() or DEFAULT_NETWORK_API_PREFIX
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

    if probe.get("ok") and probe.get("reachable"):
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
        try:
            return _start_client_proxy_from_relay_join(
                room,
                relay_join.get("data") or {},
                DEFAULT_RELAY_LOCAL_PORT,
            )
        except Exception as exc:
            logger.exception("Не удалось запустить relay proxy")
            return {
                "ok": False,
                "error": f"relay_proxy_start_failed: {exc}"
            }

    return {
        "ok": False,
        "error": "direct_unreachable_no_tcp_relay",
        "endpoint": probe.get("endpoint") if isinstance(probe, dict) else None,
        "turn_available": bool(turn.get("ok")),
        "turn_error": turn.get("error"),
        "relay_error": relay_join.get("error"),
        "hint": "Нужен VPN/туннель или встроенный TCP relay.",
    }
    
@eel.expose
def start_relay_client_proxy(room_id="", local_port: int = DEFAULT_RELAY_LOCAL_PORT):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    if not room:
        return {"ok": False, "error": "room_empty"}

    try:
        local_port = int(local_port or DEFAULT_RELAY_LOCAL_PORT)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_local_port"}
    if local_port < 1 or local_port > 65535:
        return {"ok": False, "error": "local_port_out_of_range"}

    user_id = str(cfg.get("user_id") or cfg.get("client_id") or "").strip()
    if not user_id:
        user_id = str(uuid.uuid4())
        cfg["user_id"] = user_id
        _save_network_config(cfg)

    relay_join = _relay_room_request(room, "join", payload={"user_id": user_id})
    if not relay_join.get("ok"):
        return relay_join

    try:
        return _start_client_proxy_from_relay_join(
            room,
            relay_join.get("data") or {},
            local_port,
        )
    except Exception as exc:
        logger.exception("Не удалось запустить relay proxy")
        return {"ok": False, "error": f"relay_proxy_start_failed: {exc}"}


@eel.expose
def stop_relay_client_proxy(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    proxy = _RELAY_CLIENT_PROXIES.get(room)
    if not proxy:
        return {"ok": True, "room_id": room, "status": "not_running"}
    proxy.stop()
    _RELAY_CLIENT_PROXIES.pop(room, None)
    return {"ok": True, "room_id": room, "status": "stopped"}


@eel.expose
def get_relay_client_proxy_status(room_id=""):
    cfg = _load_network_config()
    room = str(room_id or cfg.get("active_room") or "").strip()
    proxy = _RELAY_CLIENT_PROXIES.get(room)
    if not proxy:
        return {"ok": True, "room_id": room, "running": False, "status": "idle"}
    return {"ok": True, "room_id": room, "running": True, **proxy.status()}


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