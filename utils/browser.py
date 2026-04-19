import os
import sys
import socket

def find_browser():
    """ Проверяет, установлен ли Chrome, Firefox, Edge или Opera, и возвращает путь. """
    if sys.platform == "win32":
        browsers = {
            "chrome": [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
            ],
            "firefox": [
                r"C:\Program Files\Mozilla Firefox\firefox.exe",
                r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe"
            ],
            "opera": [
                r"C:\Users\{}\AppData\Local\Programs\Opera\launcher.exe".format(os.getlogin()),
                r"C:\Program Files\Opera\launcher.exe",
                r"C:\Program Files (x86)\Opera\launcher.exe"
            ],
            "edge": [
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            ],
        }
        for browser, paths in browsers.items():
            for path in paths:
                if os.path.exists(path):
                    return browser
    return None


def find_free_port(start=8000, end=9000):
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    raise RuntimeError("Нет доступных портов в указанном диапазоне.")