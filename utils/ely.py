import logging
from pathlib import Path
from typing import Any, Dict

import requests

AUTH_SERVER = "https://authserver.ely.by"
SKIN_SYSTEM = "https://skinsystem.ely.by"
AUTHLIB_ARTIFACT_API = "https://authlib-injector.yushi.moe/artifact/latest.json"
AUTHLIB_RELEASES_API = "https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest"
AUTHLIB_FALLBACK_URL = "https://github.com/yushijinhun/authlib-injector/releases/latest/download/authlib-injector.jar"
AUTHLIB_PATH = Path(r"C:\.stoneworld\authlib\authlib-injector.jar")
REQUEST_TIMEOUT = (5, 25)

logger = logging.getLogger(__name__)


def _post_auth(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    session = requests.Session()
    session.trust_env = False

    try:
        response = session.post(
            f"{AUTH_SERVER}{path}",
            json=payload,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "StoneLauncher/1.0"},
        )

        try:
            data = response.json() if response.content else {}
        except ValueError:
            data = {}

        if response.status_code >= 400:
            message = (
                data.get("errorMessage")
                or data.get("error")
                or f"ely_auth_http_{response.status_code}"
            )
            raise RuntimeError(str(message))

        return data

    except requests.exceptions.Timeout:
        raise RuntimeError("Ely.by не отвечает. Превышено время ожидания.")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Нет соединения с Ely.by. Проверь интернет, DNS, VPN или Proxy.")
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Ошибка запроса Ely.by: {exc}")


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
    session = requests.Session()
    session.trust_env = False

    try:
        response = session.post(
            f"{AUTH_SERVER}/auth/validate",
            json={"accessToken": access_token},
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "StoneLauncher/1.0"},
        )
        return response.status_code in (200, 204)
    except requests.exceptions.RequestException:
        logger.warning("Не удалось проверить Ely.by токен", exc_info=True)
        return False


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

    if not download_url.startswith("https://"):
        raise RuntimeError("Небезопасная ссылка для скачивания authlib-injector")

    tmp_path = AUTHLIB_PATH.with_suffix(".jar.tmp")

    session = requests.Session()
    session.trust_env = False

    try:
        with session.get(
            download_url,
            stream=True,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "StoneLauncher/1.0"},
        ) as response:
            response.raise_for_status()

            with tmp_path.open("wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        file.write(chunk)

        if tmp_path.stat().st_size <= 1024:
            raise RuntimeError("Скачанный authlib-injector повреждён или слишком маленький")

        tmp_path.replace(AUTHLIB_PATH)
        return str(AUTHLIB_PATH)

    except Exception:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
        raise

def skin_face_data_uri(username: str, size: int = 128) -> str:
    """Download an Ely.by skin and return the Minecraft face as a PNG data URI.

    The browser should not crop Ely.by skins with canvas because the remote
    server can taint the canvas without CORS headers. Cropping on the Python
    side keeps the UI independent of CORS and lets it render the final face as
    a normal image source.
    """
    safe_name = str(username or "").strip()
    if not safe_name:
        return ""

    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Для отображения лица Minecraft-скина установите Pillow") from exc

    from base64 import b64encode
    from io import BytesIO

    response = requests.get(
        skin_url(safe_name),
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": "StoneLauncher/1.0"},
    )
    response.raise_for_status()

    with Image.open(BytesIO(response.content)) as skin_image:
        skin = skin_image.convert("RGBA")

    if skin.width < 16 or skin.height < 16:
        raise RuntimeError("Ely.by вернул слишком маленький файл скина")

    face = skin.crop((8, 8, 16, 16))
    if skin.width >= 48:
        overlay = skin.crop((40, 8, 48, 16))
        face.alpha_composite(overlay)

    resampling = getattr(Image, "Resampling", Image).NEAREST
    face = face.resize((int(size), int(size)), resampling)

    output = BytesIO()
    face.save(output, format="PNG")
    return "data:image/png;base64," + b64encode(output.getvalue()).decode("ascii")