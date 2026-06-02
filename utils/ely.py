import logging
from pathlib import Path
from typing import Any, Dict

import requests

AUTH_SERVER = "https://authserver.ely.by"
SKIN_SYSTEM = "http://skinsystem.ely.by"
AUTHLIB_ARTIFACT_API = "https://authlib-injector.yushi.moe/artifact/latest.json"
AUTHLIB_RELEASES_API = "https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest"
AUTHLIB_FALLBACK_URL = "https://github.com/yushijinhun/authlib-injector/releases/latest/download/authlib-injector.jar"
AUTHLIB_PATH = Path(r"C:\.stoneworld\authlib\authlib-injector.jar")
REQUEST_TIMEOUT = (5, 25)

logger = logging.getLogger(__name__)


def _post_auth(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(
        f"{AUTH_SERVER}{path}",
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    try:
        data = response.json() if response.content else {}
    except ValueError:
        data = {}
    if response.status_code >= 400:
        message = data.get("errorMessage") or data.get("error") or "ely_auth_error"
        raise RuntimeError(str(message))
    return data


def authenticate(username: str, password: str, client_token: str) -> Dict[str, Any]:
    return _post_auth(
        "/auth/authenticate",
        {
            "username": username,
            "password": password,
            "clientToken": client_token,
            "requestUser": True,
            "agent": {"name": "Minecraft", "version": 1},
        },
    )


def refresh(access_token: str, client_token: str) -> Dict[str, Any]:
    return _post_auth(
        "/auth/refresh",
        {
            "accessToken": access_token,
            "clientToken": client_token,
            "requestUser": True,
        },
    )


def validate(access_token: str) -> bool:
    response = requests.post(
        f"{AUTH_SERVER}/auth/validate",
        json={"accessToken": access_token},
        timeout=REQUEST_TIMEOUT,
    )
    return response.status_code == 204 or response.status_code == 200


def skin_url(username: str) -> str:
    safe_name = str(username or "").strip()
    if not safe_name:
        return ""
    return f"{SKIN_SYSTEM}/skins/{safe_name}.png"


def _find_download_url(data) -> str:
    if isinstance(data, dict):
        direct = str(data.get("download_url") or data.get("downloadUrl") or "")
        if direct:
            return direct
        for value in data.values():
            found = _find_download_url(value)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_download_url(item)
            if found:
                return found
    return ""


def _latest_authlib_download_url() -> str:
    try:
        response = requests.get(AUTHLIB_ARTIFACT_API, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        download_url = _find_download_url(response.json())
        if download_url:
            return download_url
    except Exception:
        logger.warning("Не удалось получить latest authlib-injector artifact", exc_info=True)

    try:
        response = requests.get(AUTHLIB_RELEASES_API, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        for asset in data.get("assets", []):
            name = str(asset.get("name") or "")
            url = str(asset.get("browser_download_url") or "")
            if name.endswith(".jar") and "authlib-injector" in name and url:
                return url
    except Exception:
        logger.warning("Не удалось получить latest authlib-injector release", exc_info=True)
    return AUTHLIB_FALLBACK_URL


def ensure_authlib_injector() -> str:
    AUTHLIB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if AUTHLIB_PATH.exists() and AUTHLIB_PATH.stat().st_size > 1024:
        return str(AUTHLIB_PATH)

    download_url = _latest_authlib_download_url()
    with requests.get(download_url, stream=True, timeout=REQUEST_TIMEOUT) as response:
        response.raise_for_status()
        tmp_path = AUTHLIB_PATH.with_suffix(".jar.tmp")
        with tmp_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if chunk:
                    file.write(chunk)
        tmp_path.replace(AUTHLIB_PATH)
    return str(AUTHLIB_PATH)