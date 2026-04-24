import json
import os
import re
import time
import minecraft_launcher_lib
import subprocess
import eel
import threading
import logging

from uuid import uuid1
from db.data import get_memory, get_checkbox, get_bit_optimiz_argument
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

def run_minecraft(login: str, version: str, server: str):
    time.sleep(0.8)
    _set_state(STATE_STARTING, progress=5)
    _update_ui_progress(5)
    logger.info("Запуск Minecraft: login=%s version=%s server=%s", login, version, server or "-")
    try:
        options = {
            'username': login,
            'uuid': str(uuid1()),
            'token': '1234322354543342'
        }
        bit_checkbox, optimiz_checkbox, argument = get_bit_optimiz_argument()
        time.sleep(0.8)
        _set_state(STATE_STARTING, progress=20)
        _update_ui_progress(20)
        
        memory = get_memory()[0]
        if memory >= 10_000:
            memory = str(memory)[:2]
        else:
            memory = str(memory)[0]
            
        if argument == '':
            if bit_checkbox == 1 and optimiz_checkbox == 0:
                options["jvmArguments"] = ['-d64', f"-Xmx{memory}G", f"-Xms{memory}G"]
            elif bit_checkbox == 1 and optimiz_checkbox == 1:
                options["jvmArguments"] = ['-d64', "-Xmx8G", "-Xms4G", "-Xmn6G", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseG1GC", "-XX:ParallelGCThreads=8", "-XX:+AggressiveOpts"]
            else:
                options["jvmArguments"] = [f"-Xmx{memory}G", f"-Xms{memory}G"]
        
        elif argument == 'Tenelia':
            options["jvmArguments"] = ['-Xmx4G', '-Xms4G', '-Xmn768m', '-XX:+DisableExplicitGC', '-XX:+UseConcMarkSweepGC', '-XX:+UseParNewGC', '-XX:+UseNUMA', '-XX:+CMSParallelRemarkEnabled', '-XX:MaxTenuringThreshold=15', '-XX:MaxGCPauseMillis=30', '-XX:GCPauseIntervalMillis=150', '-XX:+UseAdaptiveGCBoundary', '-XX:-UseGCOverheadLimit', '-XX:+UseBiasedLocking', '-XX:SurvivorRatio=8', '-XX:TargetSurvivorRatio=90', '-XX:MaxTenuringThreshold=15', '-Dfml.ignorePatchDiscrepancies=true', '-Dfml.ignoreInvalidMinecraftCertificates=true', '-XX:+UseFastAccessorMethods', '-XX:+UseCompressedOops', '-XX:+OptimizeStringConcat', '-XX:+AggressiveOpts', '-XX:ReservedCodeCacheSize=2048m', '-XX:+UseCodeCacheFlushing', '-XX:SoftRefLRUPolicyMSPerMB=10000', '-XX:ParallelGCThreads=10', '-XX:+AlwaysPreTouch', '-XX:+ParallelRefProcEnabled', '-XX:+PerfDisableSharedMem', '-XX:-UsePerfData']
        
        elif argument == 'G1GC':
            options["jvmArguments"] = ['-Xms4G', '-Xmx4G', '-Xmn512m', '-XX:+AggressiveOpts', '-XX:+AlwaysPreTouch', '-XX:+DisableExplicitGC', '-XX:+ParallelRefProcEnabled', '-XX:+PerfDisableSharedMem', '-XX:-UsePerfData', '-XX:MaxGCPauseMillis=200', '-XX:ParallelGCThreads=8', '-XX:ConcGCThreads=2', '-XX:+UseG1GC', '-XX:InitiatingHeapOccupancyPercent=50', '-XX:G1HeapRegionSize=1', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=8']
        
        else:
            options["jvmArguments"] = argument.split(' ')
        
        minecraft_directory_version = minecraft_directory + f"\\{version}"
        path = minecraft_directory_version + f"\\versions"
        time.sleep(0.8)
        _set_state(STATE_STARTING, progress=35)
        _update_ui_progress(35)

        if version.startswith('Forge') or version.startswith('ПВП'):
            folders = [folder for folder in os.listdir(path) if os.path.isdir(os.path.join(path, folder))]
            for folder in folders:
                if folder.lower().startswith('forge'):
                    version = folder
                    break
            else:
                for folder in folders:
                    if 'forge' in folder:
                        version = folder
                        
        elif version.startswith('Fabric'):
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