import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = (5, 25)
CUSTOM_SKIN_LOADER_SLUG = "customskinloader"
MODRINTH_VERSIONS_URL = f"https://api.modrinth.com/v2/project/{CUSTOM_SKIN_LOADER_SLUG}/version"
CUSTOM_SKIN_LOADER_PREFIX = "CustomSkinLoader"
MODRINTH_HEADERS = {"User-Agent": "StoneLauncher/2.0 (CustomSkinLoader installer)"}


def detect_mod_loader(version_name: str) -> Tuple[str, str]:
    """Best-effort detection of mod loader and Minecraft version from launcher build name."""
    raw_name = str(version_name or "").strip()
    normalized = f" {raw_name.lower()} "
    loader = ""
    if raw_name.startswith("Fabric") or " fabric " in normalized:
        loader = "fabric"
    elif raw_name.startswith("Forge") or raw_name.startswith("ПВП") or " forge " in normalized:
        loader = "forge"

    matches = re.findall(r"(?<!\d)(\d+\.\d+(?:\.\d+)?)(?!\d)", raw_name)
    game_version = matches[-1] if matches else ""
    return loader, game_version


def _mods_dir(instance_path: Path) -> Path:
    return instance_path / "mods"


def _skin_cache_dir(instance_path: Path) -> Path:
    return instance_path / "CustomSkinLoader" / "LocalSkin" / "skins"


def _download_file(url: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target.with_suffix(target.suffix + ".tmp")
    with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT) as response:
        response.raise_for_status()
        with tmp_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if chunk:
                    file.write(chunk)
    tmp_path.replace(target)


def _select_custom_skin_loader_version(game_version: str, loader: str) -> Optional[Dict]:
    response = requests.get(MODRINTH_VERSIONS_URL, headers=MODRINTH_HEADERS, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    versions = response.json()
    fallback = None
    for version in versions:
        game_versions = version.get("game_versions") or []
        loaders = version.get("loaders") or []
        if game_version and game_version not in game_versions:
            continue
        if loader and loader not in loaders:
            continue
        return version

    # Some CustomSkinLoader artifacts are universal. Keep a conservative fallback
    # for the requested Minecraft version when Modrinth loader metadata differs.
    for version in versions:
        game_versions = version.get("game_versions") or []
        if game_version and game_version not in game_versions:
            continue
        if not fallback:
            fallback = version
    return fallback


def _primary_file(version: Dict) -> Optional[Dict]:
    files = version.get("files") or []
    return next((file for file in files if file.get("primary")), None) or (files[0] if files else None)


def _remove_old_custom_skin_loader_jars(mods_path: Path, keep: Path):
    for jar in mods_path.glob(f"{CUSTOM_SKIN_LOADER_PREFIX}*.jar"):
        if jar.resolve() == keep.resolve():
            continue
        try:
            jar.unlink()
        except OSError:
            logger.warning("Не удалось удалить старый CustomSkinLoader: %s", jar, exc_info=True)


def install_custom_skin_loader(version_name: str, instance_path: str | Path) -> Dict:
    loader, game_version = detect_mod_loader(version_name)
    if loader not in {"forge", "fabric"} or not game_version:
        return {"ok": False, "skipped": True, "reason": "unsupported_loader"}

    root = Path(instance_path)
    mods_path = _mods_dir(root)
    mods_path.mkdir(parents=True, exist_ok=True)

    selected = _select_custom_skin_loader_version(game_version, loader)
    if not selected:
        return {
            "ok": False,
            "skipped": True,
            "reason": "mod_version_not_found",
            "loader": loader,
            "game_version": game_version,
        }

    file_obj = _primary_file(selected)
    if not file_obj:
        return {"ok": False, "error": "custom_skin_loader_file_missing"}

    filename = str(file_obj.get("filename") or "CustomSkinLoader.jar")
    file_url = str(file_obj.get("url") or "")
    if not file_url:
        return {"ok": False, "error": "custom_skin_loader_url_missing"}

    target = mods_path / filename
    if not target.exists() or target.stat().st_size <= 1024:
        _download_file(file_url, target)
    _remove_old_custom_skin_loader_jars(mods_path, target)
    return {
        "ok": True,
        "name": filename,
        "loader": loader,
        "game_version": game_version,
        "installed_at": datetime.utcnow().isoformat(),
    }


def install_local_skin(instance_path: str | Path, username: str, skin_url: str) -> Dict:
    username = str(username or "").strip()
    skin_url = str(skin_url or "").strip()
    if not username or not skin_url:
        return {"ok": False, "skipped": True, "reason": "skin_data_missing"}

    skins_path = _skin_cache_dir(Path(instance_path))
    target = skins_path / f"{username}.png"
    _download_file(skin_url, target)
    return {"ok": True, "path": str(target), "name": target.name}


def ensure_client_skin_support(version_name: str, instance_path: str | Path, username: str, skin_url: str) -> Dict:
    loader, game_version = detect_mod_loader(version_name)
    if loader not in {"forge", "fabric"}:
        return {"ok": False, "skipped": True, "reason": "unsupported_loader"}

    result = install_custom_skin_loader(version_name, instance_path)
    if not result.get("ok"):
        return result

    skin_result = install_local_skin(instance_path, username, skin_url)
    result["local_skin"] = skin_result
    result["game_version"] = game_version or result.get("game_version")
    return result