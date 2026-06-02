import json
import os
import re
import time
import minecraft_launcher_lib
import subprocess
import eel
import threading
import logging

from uuid import NAMESPACE_DNS, uuid3
from db.data import get_memory, get_checkbox, get_bit_optimiz_argument, get_account_for_launch, refresh_ely_account
from utils import ely
from utils.skin_mod import ensure_client_skin_support, install_custom_skin_loader
from utils.config import minecraft_directory, CREATE_NO_WINDOW
from utils.java_finder import find_java_8

logger = logging.getLogger(__name__)

STATE_IDLE = "idle"
STATE_STARTING = "starting"
STATE_RUNNING = "running"
STATE_FAILED = "failed"

_launch_state = STATE_IDLE
_launch_error = ""
_launch_progress = 0
_state_lock = threading.Lock()

def _memory_mb_to_gb(memory_mb: int | float | None) -> int:
    try:
        value = int(memory_mb or 0)
    except (TypeError, ValueError):
        value = 0
    if value <= 0:
        return 2
    return max(1, round(value / 1024))


def _set_state(state: str, error: str = "", progress: int | None = None):
    global _launch_state, _launch_error, _launch_progress
    with _state_lock:
        _launch_state = state
        _launch_error = error
        if progress is not None:
            _launch_progress = max(0, min(100, int(progress)))


def _get_state():
    with _state_lock:
        return _launch_state, _launch_error, _launch_progress


def _update_ui_progress(progress: int):
    try:
        eel.updateProgressDownload(progress)
    except Exception:
        logger.debug("Не удалось обновить прогресс в UI", exc_info=True)
        
def _offline_uuid(login: str) -> str:
    return str(uuid3(NAMESPACE_DNS, f"OfflinePlayer:{login}"))


def _build_launch_options(login: str):
    account = get_account_for_launch(login) or {}
    account_type = account.get("account_type") or "offline"
    if account_type == "ely":
        token = account.get("access_token") or ""
        client_token = account.get("client_token") or ""
        if token and client_token:
            try:
                if not ely.validate(token):
                    refresh_result = refresh_ely_account(login)
                    if refresh_result.get("ok"):
                        account = get_account_for_launch(refresh_result.get("login") or login) or account
            except Exception:
                logger.warning("Не удалось проверить Ely.by токен перед запуском", exc_info=True)
        return {
            "username": account.get("login") or login,
            "uuid": account.get("uuid") or _offline_uuid(login),
            "token": account.get("access_token") or "",
            "account_type": "ely",
            "skin_url": account.get("skin_url") or ely.skin_url(account.get("login") or login),
        }
    return {
        "username": login,
        "uuid": account.get("uuid") or _offline_uuid(login),
        "token": "0",
        "account_type": "offline",
    }


def _prepend_ely_authlib_argument(options: dict):
    authlib_path = ely.ensure_authlib_injector()
    javaagent = f"-javaagent:{authlib_path}=ely.by"
    ssl_arguments = ["-Djava.net.preferIPv4Stack=true"]
    if os.name == "nt":
        ssl_arguments = [
            "-Djavax.net.ssl.trustStoreType=Windows-ROOT",
            "-Dcom.sun.net.ssl.checkRevocation=false",
            *ssl_arguments,
        ]
    arguments = options.get("jvmArguments") or []
    options["jvmArguments"] = [*ssl_arguments, javaagent, *arguments]

def run_minecraft(login: str, version: str, server: str):
    time.sleep(0.8)
    _set_state(STATE_STARTING, progress=5)
    _update_ui_progress(5)
    logger.info("Запуск Minecraft: login=%s version=%s server=%s", login, version, server or "-")
    try:
        account_options = _build_launch_options(login)
        account_type = account_options.pop("account_type", "offline")
        skin_url = account_options.pop("skin_url", "")
        options = account_options
        bit_checkbox, optimiz_checkbox, argument = get_bit_optimiz_argument()
        time.sleep(0.8)
        _set_state(STATE_STARTING, progress=20)
        _update_ui_progress(20)
        
        memory_row = get_memory()
        memory_gb = _memory_mb_to_gb(memory_row[0] if memory_row else 2048)
            
        if argument == '':
            if bit_checkbox == 1 and optimiz_checkbox == 0:
                options["jvmArguments"] = ['-d64', f"-Xmx{memory_gb}G", f"-Xms{memory_gb}G"]
            elif bit_checkbox == 1 and optimiz_checkbox == 1:
                options["jvmArguments"] = ['-d64', "-Xmx8G", "-Xms4G", "-Xmn6G", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseG1GC", "-XX:ParallelGCThreads=8", "-XX:+AggressiveOpts"]
            else:
                options["jvmArguments"] = [f"-Xmx{memory_gb}G", f"-Xms{memory_gb}G"]
        
        elif argument == 'Tenelia':
            options["jvmArguments"] = ['-Xmx4G', '-Xms4G', '-Xmn768m', '-XX:+DisableExplicitGC', '-XX:+UseConcMarkSweepGC', '-XX:+UseParNewGC', '-XX:+UseNUMA', '-XX:+CMSParallelRemarkEnabled', '-XX:MaxTenuringThreshold=15', '-XX:MaxGCPauseMillis=30', '-XX:GCPauseIntervalMillis=150', '-XX:+UseAdaptiveGCBoundary', '-XX:-UseGCOverheadLimit', '-XX:+UseBiasedLocking', '-XX:SurvivorRatio=8', '-XX:TargetSurvivorRatio=90', '-XX:MaxTenuringThreshold=15', '-Dfml.ignorePatchDiscrepancies=true', '-Dfml.ignoreInvalidMinecraftCertificates=true', '-XX:+UseFastAccessorMethods', '-XX:+UseCompressedOops', '-XX:+OptimizeStringConcat', '-XX:+AggressiveOpts', '-XX:ReservedCodeCacheSize=2048m', '-XX:+UseCodeCacheFlushing', '-XX:SoftRefLRUPolicyMSPerMB=10000', '-XX:ParallelGCThreads=10', '-XX:+AlwaysPreTouch', '-XX:+ParallelRefProcEnabled', '-XX:+PerfDisableSharedMem', '-XX:-UsePerfData']
        
        elif argument == 'G1GC':
            options["jvmArguments"] = ['-Xms4G', '-Xmx4G', '-Xmn512m', '-XX:+AggressiveOpts', '-XX:+AlwaysPreTouch', '-XX:+DisableExplicitGC', '-XX:+ParallelRefProcEnabled', '-XX:+PerfDisableSharedMem', '-XX:-UsePerfData', '-XX:MaxGCPauseMillis=200', '-XX:ParallelGCThreads=8', '-XX:ConcGCThreads=2', '-XX:+UseG1GC', '-XX:InitiatingHeapOccupancyPercent=50', '-XX:G1HeapRegionSize=1', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=8']
        
        else:
            options["jvmArguments"] = argument.split(' ')
            
        if account_type == "ely":
            _prepend_ely_authlib_argument(options)
        
        minecraft_directory_version = minecraft_directory + f"\\{version}"
        try:
            if account_type == "ely":
                skin_result = ensure_client_skin_support(
                    version,
                    minecraft_directory_version,
                    options.get("username") or login,
                    skin_url,
                )
            else:
                skin_result = install_custom_skin_loader(version, minecraft_directory_version)
            if skin_result.get("ok"):
                logger.info(
                    "CustomSkinLoader установлен: version=%s loader=%s mod=%s local_skin=%s",
                    version,
                    skin_result.get("loader"),
                    skin_result.get("name"),
                    (skin_result.get("local_skin") or {}).get("name"),
                )
            elif not skin_result.get("skipped"):
                logger.warning("Не удалось установить CustomSkinLoader: %s", skin_result)
        except Exception:
            logger.warning("Не удалось подготовить client-side skin mod", exc_info=True)
        path = minecraft_directory_version + f"\\versions"
        time.sleep(0.8)
        _set_state(STATE_STARTING, progress=35)
        _update_ui_progress(35)

        if version.startswith('Forge') or version.startswith('ПВП') or ' Forge ' in f' {version} ':
            folders = [folder for folder in os.listdir(path) if os.path.isdir(os.path.join(path, folder))]
            for folder in folders:
                if folder.lower().startswith('forge'):
                    version = folder
                    break
            else:
                for folder in folders:
                    if 'forge' in folder:
                        version = folder
                        
        elif version.startswith('Fabric') or ' Fabric ' in f' {version} ':
            folders = [folder for folder in os.listdir(path) if os.path.isdir(os.path.join(path, folder))]
            for folder in folders:
                if folder.lower().startswith("fabric-loader") and version.split()[-1] in folder:
                    version = folder
                    break
            else:
                for folder in folders:
                    if folder.lower().startswith("fabric-loader"):
                        version = folder
                        break
                        
        if version.startswith('LunarПВП'):
            java_path = find_java_8(prefer_javaw=True)
            if not java_path:
                raise RuntimeError(
                    "Java 8 не найдена.\n\n"
                    "Для запуска Minecraft 1.8.9 / LunarПВП нужна Java 8 x64."
                )

            logger.info("Найдена Java 8: %s", java_path)
            options["executablePath"] = java_path
            version = 'Flight Client for Cracked'
            file_path = r"C:\.stoneworld\SWMinecraft\LunarПВП 1.8.9\versions\Flight Client for Cracked\Flight Client for Cracked.json"
            with open(file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)
                if "minecraftArguments" in data:
                    minecraft_arguments = data["minecraftArguments"]
                    
                    # Проверяем, существует ли уже --server в minecraftArguments
                    if "--server" in minecraft_arguments:
                    # Заменяем старый IP адрес на новый
                        updated_arguments = re.sub(r"--server\s+[^\s]+", f"--server {server}", minecraft_arguments)
                    else:
                    #     # Добавляем новый IP адрес в конец строки
                        updated_arguments = minecraft_arguments + f" --server {server}"
                    
                    # Обновляем minecraftArguments новым значением
                    data["minecraftArguments"] = updated_arguments
                    # data["minecraftArguments"] = minecraft_arguments
                    
            with open(file_path, 'w', encoding='utf-8') as file:
                json.dump(data, file, ensure_ascii=False, indent=4)
        
        subprocess.Popen(r"C:\.stoneworld\access\SLtimegame.exe", creationflags=CREATE_NO_WINDOW)
        
        command = minecraft_launcher_lib.command.get_minecraft_command(
            version=version, 
            minecraft_directory=minecraft_directory_version,
            options=options
        )
        time.sleep(0.8)
        _set_state(STATE_STARTING, progress=60)
        _update_ui_progress(60)
        process = subprocess.Popen(
            command,
            creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        time.sleep(2)
        _set_state(STATE_RUNNING, progress=100)
        _update_ui_progress(100)
        if process.stdout:
            for line in process.stdout:
                text = line.rstrip()
                if text:
                    logger.info("[Minecraft] %s", text)
        code = process.wait()
        if code != 0:
            _set_state(STATE_FAILED, f"Minecraft exited with code {code}", progress=100)
            logger.error("Minecraft завершился с ошибкой. code=%s version=%s", code, version)
            return
        logger.info("Minecraft завершился штатно. version=%s", version)
        _set_state(STATE_IDLE, progress=0)
        try:
            checkbox = get_checkbox()
            if checkbox == 0:
                time.sleep(4)
                eel.updatePlaytimeOnPage()
        except Exception:
            logger.exception("Не удалось обновить время игры в UI")
    except Exception as error:
        logger.exception("Ошибка запуска Minecraft")
        _set_state(STATE_FAILED, str(error))
        _set_state(STATE_FAILED, str(error), progress=100)
        

@eel.expose
def start_game(login: str, version: str, server: str):
    _set_state(STATE_STARTING, progress=0)
    logger.info("Получен запрос на запуск игры")
    threading.Thread(target=run_minecraft, args=(login, version, server)).start()

    attempts = 0
    while attempts < 120:
        time.sleep(0.25)
        attempts += 1
        state, error, progress = _get_state()
        if state == STATE_FAILED:
            raise RuntimeError(error or "Ошибка запуска игры")

        if state == STATE_RUNNING:
            _update_ui_progress(100)
            return True
        
        _update_ui_progress(min(progress, 95))

    state, error, _ = _get_state()
    if state != STATE_RUNNING:
        raise RuntimeError(error or "Таймаут запуска игры")
    return True
        

@eel.expose
def check_close():
    checkbox = get_checkbox()
    if checkbox == 1:
        return True
    else:
        return False