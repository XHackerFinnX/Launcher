import eel

from db.data import start_check_version_launcher, add_version_launcher
from utils.browser import find_browser, find_free_port
from utils.folder import download_java, get_center_position

from utils.download import downolad_launcher_version, minecraft_download_version, minecraft_download_version_build
from utils.game import start_game, check_close
from utils.folder import open_folder_version
from db.data import (
    insert_version, get_versions, insert_account, delete_account, get_accounts,
    update_account_version, get_account_version, update_setting_memory,
    update_setting_checkbox, update_setting_bit_checkbox, update_setting_optimiz_checkbox,
    update_setting_argument, get_settings, delete_versions_list, check_server_info,
    get_ip_address, delete_server_by_ip, sum_time, check_version_launcher
)

def main():
    eel.init('web')
        
    file_html = 'main.html'
    width = 1290
    height = 628
        
    # Проверка на установку Java
    if not download_java():
        file_html = 'error_java.html'
        width = 800
        height = 400
        
    if start_check_version_launcher():
        add_version_launcher()
        
    browser = find_browser()
    pos_x, pos_y = get_center_position(width, height)
    
    eel.start(file_html, mode=browser, port=0, size=(width, height), position=(pos_x, pos_y))

if __name__ == '__main__':
    main()