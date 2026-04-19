import os
import time
import zipfile
import requests


def download_zip(url, save_folder, filename):
    """Функция скачивания файла zip"""
    os.makedirs(save_folder, exist_ok=True)
    file_path = os.path.join(save_folder, filename)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
    }
    
    response = requests.get(url, headers=headers, stream=True)
    
    if response.status_code == 200:
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        print(f'{filename} загружен')
        time.sleep(1)
        return True
    else:
        print(f"Ошибка при загрузке {filename}: {response.status_code}")
        return False
    

def unzip_zip(save_folder, filename, extract_folder):
    """Функция распаковки zip архива"""
    zip_path = os.path.join(save_folder, filename)
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_folder)
        print(f'{filename} распакован в {extract_folder}')
    
    time.sleep(4)
    
    # Удаляем ZIP архив после распаковки
    os.remove(zip_path)
    print(f'{filename} удалён')
    time.sleep(4)


def download_mods_pvp_1_8_9(name):
    url_folder = f"C:\\.stoneworld\\SWMinecraft\\{name}"
    if download_zip(
        'https://github.com/XHackerFinnX/SLauncher/raw/main/pvp_mods_1_8_9.zip',
        url_folder,
        'pvp189.zip'
    ): 
        unzip_zip(url_folder, 'pvp189.zip', url_folder+f"\\mods")
        
def download_resourcepacks_pvp_1_8_9(name):
    url_folder = f"C:\\.stoneworld\\SWMinecraft\\{name}\\resourcepacks"
    download_zip(
        'https://github.com/XHackerFinnX/SLauncher/raw/main/A-Huahwi-Pack-64x-HL%20Ores.zip',
        url_folder,
        'A-Huahwi-Pack-64x-HL Ores.zip'
    )
    
def download_options_pvp_1_8_9(name):
    url_folder = f"C:\\.stoneworld\\SWMinecraft\\{name}"
    if download_zip(
        'https://github.com/XHackerFinnX/SLauncher/raw/main/options_pvp_1_8_9.zip',
        url_folder,
        'options.zip'
    ): 
        unzip_zip(url_folder, 'options.zip', url_folder)
        
def download_client_lunar_pvp_1_8_9(name):
    url_folder = f"C:\\.stoneworld\\SWMinecraft\\{name}\\versions"
    if download_zip(
        'https://download2389.mediafire.com/xang3wk7x8ugoVSJxnH_siGedabNUmFvoTrX2nNOS-CFlMYdIh9uu4dE1pa7N5WtH1N-ncCp_Ld4BaPF9ZXG5RAZMrd8wiyFS25yLqw40HdwMPv0l6Igq0BD80ydPCS4FPlTe-SuGciIroZ_UPtmtCDN_V0r-HEFqxofxtSJ5YgH-O-W/ocangmmc8mvie8d/FlightClient1.8.9.zip',
        url_folder,
        'FlightClientforCracked.zip'
    ): 
        unzip_zip(url_folder, 'FlightClientforCracked.zip', url_folder)