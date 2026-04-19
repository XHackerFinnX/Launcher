import os
import shutil
import subprocess
import sys
import time
import minecraft_launcher_lib
import eel
import psutil
import requests
import shutil

from utils.config import minecraft_directory, version_optifine
from db.data import delete_version_error
from utils.folder import add_mods, add_resourcepacks
from utils.mods_download import download_client_lunar_pvp_1_8_9, download_mods_pvp_1_8_9, download_options_pvp_1_8_9, download_resourcepacks_pvp_1_8_9

current_max = 0
current_progress = 0

def set_status(status: str):
    pass

def set_progress(progress: int):
    global current_progress
    global current_max
    global is_first_stage

    if current_max != 0:
        current_progress = min(progress, current_max)
        percent = (current_progress / current_max) * 100

        eel.updateProgressDownload(percent)

def set_max(new_max: int):
    global current_max
    current_max = new_max

callback = {
    "setStatus": set_status,
    "setProgress": set_progress,
    "setMax": set_max
}

@eel.expose
def minecraft_download_version(version: str):
    minecraft_directory_version = minecraft_directory + f"\\{version}"
    if not os.path.exists(minecraft_directory_version):
        minecraft_launcher_lib.install.install_minecraft_version(versionid=version, minecraft_directory=minecraft_directory_version, callback=callback)


@eel.expose
def minecraft_download_version_build(version_fabric_forge: str):
    minecraft_directory_version = minecraft_directory + f"\\{version_fabric_forge}"
    version_null = version_fabric_forge.split()[-1]
    name = version_fabric_forge.split()[0]
    
    if not os.path.exists(minecraft_directory_version):
        try:
            if name.startswith('Forge'):
                version = minecraft_launcher_lib.forge.find_forge_version(version_null)
                minecraft_launcher_lib.forge.install_forge_version(
                    versionid=version, 
                    path=minecraft_directory_version,
                    callback=callback
                )
                
            elif name.startswith('ПВП') or name.startswith('LunarПВП'):
                version = minecraft_launcher_lib.forge.find_forge_version(version_null)
                minecraft_launcher_lib.forge.install_forge_version(
                    versionid=version, 
                    path=minecraft_directory_version,
                    callback=callback
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
        
        except:
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
    
    response = requests.get(url=url_file, headers=headers, proxies=proxies, stream=True)
    try:
        if response.status_code == 200:
            with open(name_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            shutil.move(f"./{name_file}", url_folder)
        else:
            print(f"Ошибка при загрузке файла: {response.status_code}")
    except:
        pass
    
    return

@eel.expose
def downolad_launcher_version():
    exe_path = r"C:\.stoneworld\access\SLupdate.exe"

    if os.path.exists(exe_path):
        subprocess.Popen([exe_path], shell=True)
        close_app_exe()
    else:
        print("Файл не найден:", exe_path)
        
def close_app_exe():
    """Закрывает приложение EEL"""
    print("Приложение закрывается...")
    os._exit(0)