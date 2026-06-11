import logging
import eel

from db.database import init_database
from db.data import start_check_version_launcher, add_version_launcher
from utils.browser import find_browser, find_free_port
from utils.folder import download_java, get_center_position
from utils.logger import setup_logging
from utils.proxy_support import ensure_socks_proxy_support
from utils.feedback_info import (
    get_launcher_feedback_system_id,
    get_launcher_feedback_technical_info,
)
from utils.download import downolad_launcher_version, minecraft_download_version, minecraft_download_version_build
from utils.game import start_game, check_close
from utils.folder import open_folder_version
from utils.java_finder import find_java_8
from utils.worlds import list_worlds, open_saves_folder, delete_world
from utils.build_share import (
    share_build, open_share_folder, pick_build_archive,
    receive_build_archive, inspect_build_archive, install_build_archive
)
from utils.theme_share import (
    pick_theme_background_image, read_theme_background_image, save_theme_background_copy,
    share_theme, open_theme_share_folder, pick_theme_archive,
    receive_theme_archive, inspect_theme_archive, install_theme_archive
)

def main():
    ensure_socks_proxy_support()
    setup_logging()
    init_database(r"C:\.stoneworld\db\launcher.db")
    eel.init('web')
        
    file_html = 'main.html'
    width = 1446
    height = 867
        
    # Проверка на установку Java
    if not download_java():
        file_html = 'error_java.html'
        width = 800
        height = 400
        
    if start_check_version_launcher():
        add_version_launcher()
        
    browser = find_browser()
    pos_x, pos_y = get_center_position(width, height)
    
    eel.start(
        file_html,
        mode=browser,
        port=0,
        size=(width, height),
        position=(pos_x, pos_y),
    )

if __name__ == '__main__':
    main()