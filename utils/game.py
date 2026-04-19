import json
import os
import re
import time
import minecraft_launcher_lib
import subprocess
import eel
import threading

from uuid import uuid1
from db.data import get_memory, get_checkbox, get_bit_optimiz_argument
from utils.config import minecraft_directory, CREATE_NO_WINDOW

error_start = 0

def run_minecraft(login: str, version: str, server: str):
    global error_start
    error_start = 0
    try:
        options = {
            'username': login,
            'uuid': str(uuid1),
            'token': '1234322354543342'
        }
        bit_checkbox, optimiz_checkbox, argument = get_bit_optimiz_argument()
        
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
                        
        if version.startswith('LunarПВП'):
            version = 'Flight Client for Cracked'
            file_path = r"C:\.stoneworld\SWMinecraft\LunarПВП 1.8.9\versions\Flight Client for Cracked\Flight Client for Cracked.json"
            with open(file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)
                if "minecraftArguments" in data:
                    minecraft_arguments = data["minecraftArguments"]
                    
                    # Проверяем, существует ли уже --server в minecraftArguments
                    # if "--server" in minecraft_arguments:
                    #     # Заменяем старый IP адрес на новый
                    #     updated_arguments = re.sub(r"--server\s+[^\s]+", f"--server {server}", minecraft_arguments)
                    # else:
                    #     # Добавляем новый IP адрес в конец строки
                    #     updated_arguments = minecraft_arguments + f" --server {server}"
                    
                    # Обновляем minecraftArguments новым значением
                    # data["minecraftArguments"] = updated_arguments
                    data["minecraftArguments"] = minecraft_arguments
                    
            with open(file_path, 'w', encoding='utf-8') as file:
                json.dump(data, file, ensure_ascii=False, indent=4)
        
        subprocess.Popen(r"C:\.stoneworld\access\SLtimegame.exe", creationflags=CREATE_NO_WINDOW)
        
        command = minecraft_launcher_lib.command.get_minecraft_command(
            version=version, 
            minecraft_directory=minecraft_directory_version,
            options=options
        )
        subprocess.call(command, creationflags=CREATE_NO_WINDOW)
        try:
            checkbox = get_checkbox()
            if checkbox == 0:
                time.sleep(4)
                eel.updatePlaytimeOnPage()
        except:
            pass
    except:
        error_start = 1
        

@eel.expose
def start_game(login: str, version: str, server: str):
    global error_start

    threading.Thread(target=run_minecraft, args=(login, version, server)).start()
    
    progress = 0
    while progress < 100:
        time.sleep(0.5)
        progress += 10
        if error_start == 0:
            eel.updateProgressDownload(progress)
        else:
            break
        
    if error_start == 0:
        pass
    else:
        raise
        

@eel.expose
def check_close():
    checkbox = get_checkbox()
    if checkbox == 1:
        return True
    else:
        return False