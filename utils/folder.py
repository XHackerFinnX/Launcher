import os
import shutil
import subprocess
import zipfile
import eel
import winreg

from utils.config import minecraft_directory
from screeninfo import get_monitors

def createFolder(path):
    if not os.path.exists(path):
        os.mkdir(path)
    return

def download_dir():
    path = r"C:\Users\.."
    path_sw = r"C:\.stoneworld"
    projectname = ".stoneworld"
    minecraft_dir = "SWMinecraft"
    db = "db"
    update_exe = 'update'

    fullPath = os.path.join(path, projectname)
    fullpathsw = os.path.join(path_sw, minecraft_dir)
    fullpathdb = os.path.join(path_sw, db)
    fullpathupdate = os.path.join(path_sw, update_exe)
    createFolder(fullPath)
    createFolder(fullpathsw)
    createFolder(fullpathdb)
    createFolder(fullpathupdate)
    
def add_mods(path):
    mods = 'mods'
    fullPath = os.path.join(path, mods)
    createFolder(fullPath)
    
def add_resourcepacks(path):
    resour = 'resourcepacks'
    fullPath = os.path.join(path, resour)
    createFolder(fullPath)
    
def download_java():

    # --- 1. Проверка через PATH ---
    java_path = shutil.which("java")
    if java_path:
        try:
            subprocess.run(
                [java_path, "-version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True
            )
            return True
        except Exception:
            pass

    # --- 2. Проверка JAVA_HOME ---
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        java_exe = os.path.join(java_home, "bin", "java.exe")
        if os.path.exists(java_exe):
            return True

    # --- 3. Проверка реестра (JRE + JDK + WOW6432Node) ---
    registry_paths = [
        r"SOFTWARE\JavaSoft\Java Runtime Environment",
        r"SOFTWARE\JavaSoft\JDK",
        r"SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment",
        r"SOFTWARE\WOW6432Node\JavaSoft\JDK",
    ]

    for path in registry_paths:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as key:
                return True
        except FileNotFoundError:
            pass
        except Exception:
            pass

    return False


def zip_unzip(url ,name_file):
    unzip = url
    file_zip = zipfile.ZipFile(f"C:\\.stoneworld\\SWMinecraft\\{name_file}", 'r')
    for f in file_zip.namelist():
        full = os.path.join(unzip, f)
        d = os.path.dirname(full)
        if d:
            if not os.path.exists(d):
                os.makedirs(d)
        if os.path.basename(f):
            out = open(full, mode="wb")
            out.write(file_zip.read(f))
            out.close()
    file_zip.close()
    return

def get_center_position(width, height):
    """Возвращает координаты для центрирования окна на основном мониторе"""
    monitor = get_monitors()[0]  # основной монитор
    screen_width, screen_height = monitor.width, monitor.height
    
    x = (screen_width // 2) - (width // 2)
    y = (screen_height // 2) - (height // 2)
    return x, y

@eel.expose
def open_folder_version(version):
    path = minecraft_directory + f"\\{version}"
    subprocess.run(['explorer', path])