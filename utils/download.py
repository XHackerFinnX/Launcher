import os
import json
import shutil
import subprocess
import hashlib
import logging
import minecraft_launcher_lib
import eel
import requests

from utils.config import minecraft_directory, version_optifine
from db.data import delete_version_error
from utils.folder import add_mods, add_resourcepacks
from utils.mods_download import download_client_lunar_pvp_1_8_9, download_mods_pvp_1_8_9, download_options_pvp_1_8_9, download_resourcepacks_pvp_1_8_9

current_max = 0
current_progress = 0
REQUEST_TIMEOUT = (5, 60)
logger = logging.getLogger(__name__)

def _resolve_forge_version(vanilla_version: str) -> str:
    version = minecraft_launcher_lib.forge.find_forge_version(vanilla_version)
    if version:
        return version

    available = minecraft_launcher_lib.forge.list_forge_versions()
    prefix = f"{vanilla_version}-"
    candidates = [item for item in available if str(item).startswith(prefix)]
    if candidates:
        return candidates[0]
    raise RuntimeError(f"Не найдена совместимая Forge-версия для {vanilla_version}")

BUILD_MANIFEST_NAME = "slauncher_build.json"


def _read_json_file(path: str):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return None


def _detect_installed_core(minecraft_directory_version: str, base_version: str | None, prefer: str | None):
    """Найти version_id установленного модового ядра по inheritsFrom."""
    versions_path = os.path.join(minecraft_directory_version, "versions")
    if not os.path.isdir(versions_path):
        return None

    candidates = []
    for folder in os.listdir(versions_path):
        folder_path = os.path.join(versions_path, folder)
        if not os.path.isdir(folder_path):
            continue
        data = _read_json_file(os.path.join(folder_path, f"{folder}.json"))
        if data and data.get("inheritsFrom"):
            candidates.append((folder, data.get("inheritsFrom")))

    if not candidates:
        return None

    def score(item):
        folder, inherits = item
        low = folder.lower()
        value = 0
        if base_version and inherits == base_version:
            value += 2
        if prefer and prefer in low:
            value += 4
        if "forge" in low or "fabric" in low:
            value += 1
        return value

    candidates.sort(key=score, reverse=True)
    return candidates[0][0]


def _write_build_manifest(minecraft_directory_version: str, build_name: str,
                          base_version: str, loader: str, version_id: str | None):
    """Сохранить манифест сборки, чтобы запуск всегда находил нужное ядро."""
    manifest = {
        "build_name": build_name,
        "base_version": base_version,
        "loader": loader,
        "version_id": version_id,
    }
    try:
        with open(os.path.join(minecraft_directory_version, BUILD_MANIFEST_NAME),
                  "w", encoding="utf-8") as file:
            json.dump(manifest, file, ensure_ascii=False, indent=2)
        logger.info("Манифест сборки сохранён: %s -> %s", build_name, version_id)
    except Exception:
        logger.exception("Не удалось сохранить манифест сборки %s", build_name)


def set_status(status: str):
    if status:
        logger.info("Install status: %s", status)

def set_progress(progress: int):
    global current_progress
    global current_max
    global is_first_stage

    if current_max != 0:
        current_progress = min(progress, current_max)
        percent = (current_progress / current_max) * 100

        try:
            eel.updateProgressDownload(percent)
        except Exception:
            logger.debug("Не удалось отправить прогресс в UI", exc_info=True)

def set_max(new_max: int):
    global current_max
    current_max = new_max
    if new_max <= 0:
        return

callback = {
    "setStatus": set_status,
    "setProgress": set_progress,
    "setMax": set_max
}

@eel.expose
def minecraft_download_version(version: str):
    minecraft_directory_version = minecraft_directory + f"\\{version}"
    if not os.path.exists(minecraft_directory_version):
        logger.info("Начало установки Minecraft версии: %s", version)
        minecraft_launcher_lib.install.install_minecraft_version(
            version=version,
            minecraft_directory=minecraft_directory_version,
            callback=callback
        )
        logger.info("Minecraft версия установлена: %s", version)
        

@eel.expose
def minecraft_download_version_build(version_fabric_forge: str):
    minecraft_directory_version = minecraft_directory + f"\\{version_fabric_forge}"
    parts = version_fabric_forge.split()
    version_null = parts[-1] if parts else version_fabric_forge
    name = parts[0] if parts else version_fabric_forge
    build_lower = f" {version_fabric_forge.lower()} "
    is_forge_build = name.startswith('Forge') or " forge " in build_lower
    is_fabric_build = name.startswith('Fabric') or " fabric " in build_lower
    
    if not os.path.exists(minecraft_directory_version):
        installed_loader = "vanilla"
        installed_version_id = None
        try:
            logger.info("Начало установки сборки: %s", version_fabric_forge)
            if is_forge_build:
                installed_loader = "forge"
                version = _resolve_forge_version(version_null)
                minecraft_launcher_lib.forge.install_forge_version(
                    versionid=version, 
                    path=minecraft_directory_version,
                    callback=callback
                )
                try:
                    installed_version_id = minecraft_launcher_lib.forge.forge_to_installed_version(version)
                except Exception:
                    installed_version_id = None
            
            elif is_fabric_build:
                installed_loader = "fabric"
                if not minecraft_launcher_lib.fabric.is_minecraft_version_supported(version_null):
                    raise RuntimeError(f"Fabric не поддерживает версию Minecraft {version_null}")
                loader_version = minecraft_launcher_lib.fabric.get_latest_loader_version()
                minecraft_launcher_lib.fabric.install_fabric(
                    minecraft_version=version_null,
                    minecraft_directory=minecraft_directory_version,
                    loader_version=loader_version,
                    callback=callback
                )
                installed_version_id = f"fabric-loader-{loader_version}-{version_null}"
            
            elif name.startswith('ПВП') or name.startswith('LunarПВП'):
                installed_loader = "forge"
                version = _resolve_forge_version(version_null)
                minecraft_launcher_lib.forge.install_forge_version(
                    versionid=version, 
                    path=minecraft_directory_version,
                    callback=callback
                )
                try:
                    installed_version_id = minecraft_launcher_lib.forge.forge_to_installed_version(version)
                except Exception:
                    installed_version_id = None
            else:
                # Чистая (ванильная) кастомная сборка без загрузчика
                installed_loader = "vanilla"
                minecraft_launcher_lib.install.install_minecraft_version(
                    version=version_null,
                    minecraft_directory=minecraft_directory_version,
                    callback=callback
                )
                installed_version_id = version_null

            # Если version_id не удалось получить напрямую — определяем сканированием.
            if not installed_version_id or not os.path.isdir(
                os.path.join(minecraft_directory_version, "versions", installed_version_id)
            ):
                prefer = "forge" if installed_loader == "forge" else (
                    "fabric" if installed_loader == "fabric" else None
                )
                if prefer:
                    detected = _detect_installed_core(minecraft_directory_version, version_null, prefer)
                    if detected:
                        installed_version_id = detected

            # Записываем манифест сразу после установки ядра, до загрузки модов,
            # чтобы запуск всегда мог найти корректное ядро.
            _write_build_manifest(
                minecraft_directory_version,
                build_name=version_fabric_forge,
                base_version=version_null,
                loader=installed_loader,
                version_id=installed_version_id,
            )

            add_resourcepacks(minecraft_directory_version)
            add_mods(minecraft_directory_version)
            minecraft_directory_version_optifine = minecraft_directory_version + f'\\mods'
            for v, url_opt in version_optifine.items():
                if v == version_null:
                    downolad_wget(url_opt[0], url_opt[1], minecraft_directory_version_optifine)
                    break
                
            if name.startswith('ПВП'):
                download_mods_pvp_1_8_9(version_fabric_forge)
                download_resourcepacks_pvp_1_8_9(version_fabric_forge)
                download_options_pvp_1_8_9(version_fabric_forge)
                
            elif name.startswith('LunarПВП'):
                download_resourcepacks_pvp_1_8_9(version_fabric_forge)
                download_options_pvp_1_8_9(version_fabric_forge)
                download_client_lunar_pvp_1_8_9(version_fabric_forge)
            logger.info("Сборка установлена: %s", version_fabric_forge)
            try:
                eel.updateProgressDownload(100)
            except Exception:
                logger.debug("Не удалось отправить финальный прогресс в UI", exc_info=True)
        
        except Exception:
            logger.exception("Ошибка при установке сборки %s", version_fabric_forge)
            if os.path.exists(minecraft_directory_version):
                shutil.rmtree(minecraft_directory_version)
            delete_version_error(version_fabric_forge)
            raise
        
def downolad_wget(url_file, name_file, url_folder):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
    }
    
    proxies = {
        "http": None,
        "https": None
    }
    
    response = requests.get(
        url=url_file,
        headers=headers,
        proxies=proxies,
        stream=True,
        timeout=REQUEST_TIMEOUT
    )
    try:
        if response.status_code == 200:
            with open(name_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            shutil.move(f"./{name_file}", url_folder)
        else:
            print(f"Ошибка при загрузке файла: {response.status_code}")
    except Exception:
        logger.exception("Ошибка при загрузке файла %s", url_file)
        return False
    
    return True

def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_updater_binary(exe_path: str, checksum_path: str) -> bool:
    if not os.path.exists(exe_path) or not os.path.exists(checksum_path):
        return False

    with open(checksum_path, "r", encoding="utf-8") as file:
        expected = file.read().strip().split()[0].lower()

    actual = _sha256(exe_path)
    if actual != expected:
        logger.error("Checksum mismatch for updater. expected=%s actual=%s", expected, actual)
        return False
    return True

@eel.expose
def downolad_launcher_version():
    exe_path = r"C:\.stoneworld\access\SLupdate.exe"
    # checksum_path = r"C:\.stoneworld\access\SLupdate.sha256"

    if os.path.exists(exe_path):
        # if not verify_updater_binary(exe_path, checksum_path):
        #     logger.error("Файл обновления не прошел проверку контрольной суммы")
        #     return False
        subprocess.Popen([exe_path], shell=True)
        close_app_exe()
        return True
    else:
        print("Файл не найден:", exe_path)
        logger.error("Файл обновления не найден: %s", exe_path)
        return False
        
def close_app_exe():
    """Закрывает приложение EEL"""
    print("Приложение закрывается...")
    os._exit(0)
