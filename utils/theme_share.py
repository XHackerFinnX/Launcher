"""Локальный фон, экспорт и импорт тем оформления (Поделиться / Загрузить).

Аналогично utils/build_share.py, но для тем кастомизации:
  * выбор фонового изображения с компьютера и его предпросмотр;
  * копирование выбранной картинки в .stoneworld/slpicture при сохранении темы;
  * упаковка темы (все цвета + картинка) в zip-архив;
  * импорт темы из такого архива.
"""

import os
import json
import uuid
import base64
import shutil
import zipfile
import logging
import tempfile
import mimetypes
import subprocess
from pathlib import Path

import eel

from db.database import create_connection

logger = logging.getLogger(__name__)

db_path = r"C:\.stoneworld\db\launcher.db"
SLPICTURE_DIR = Path(r"C:\.stoneworld\slpicture")
SHARED_DIR = Path(r"C:\.stoneworld\shared")
THEME_MANIFEST_NAME = "slauncher_theme.json"
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")


# --------------------------------------------------------------------------- #
#  Вспомогательные функции
# --------------------------------------------------------------------------- #
def _safe_name(name: str) -> str:
    keep = "-_.() абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    cleaned = "".join(ch for ch in str(name or "") if ch.isalnum() or ch in keep).strip()
    return cleaned or "theme"


def _data_url_for(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    if not mime:
        mime = "image/png"
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _report_theme_share(percent, stage=None, log=None):
    try:
        eel.updateThemeShareProgress(percent, stage or "", log or "")
    except Exception:
        pass


def _report_theme_import(percent, stage=None, log=None):
    try:
        eel.updateThemeImportProgress(percent, stage or "", log or "")
    except Exception:
        pass


def _is_local_image(value: str) -> bool:
    """True, если значение — локальный путь к картинке, а не URL/data-URL."""
    value = str(value or "").strip()
    if not value:
        return False
    low = value.lower()
    if low.startswith(("http://", "https://", "data:")):
        return False
    return True


# --------------------------------------------------------------------------- #
#  Выбор / чтение / копирование локальной картинки
# --------------------------------------------------------------------------- #
@eel.expose
def pick_theme_background_image():
    """Открывает диалог выбора картинки. Возвращает {ok, path, data_url}."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            title="Выберите фоновое изображение",
            filetypes=[
                ("Изображения", "*.png *.jpg *.jpeg *.webp *.gif *.bmp"),
                ("Все файлы", "*.*"),
            ],
        )
        root.destroy()
    except Exception:
        logger.exception("Не удалось открыть диалог выбора картинки")
        return {"ok": False, "error": "Не удалось открыть проводник"}

    if not path:
        return {"ok": False, "cancelled": True}

    src = Path(path)
    if not src.exists() or not src.is_file():
        return {"ok": False, "error": "Файл не найден"}
    try:
        return {"ok": True, "path": str(src), "data_url": _data_url_for(src)}
    except Exception as exc:
        logger.exception("Не удалось прочитать картинку %s", path)
        return {"ok": False, "error": str(exc)}


@eel.expose
def read_theme_background_image(path: str):
    """Возвращает data-URL для уже выбранного локального файла."""
    src = Path(str(path or ""))
    if not src.exists() or not src.is_file():
        return {"ok": False, "error": "Файл не найден"}
    try:
        return {"ok": True, "path": str(src), "data_url": _data_url_for(src)}
    except Exception as exc:
        logger.exception("Не удалось прочитать картинку %s", path)
        return {"ok": False, "error": str(exc)}


@eel.expose
def save_theme_background_copy(path: str, theme_name: str = ""):
    """Копирует выбранную картинку в .stoneworld/slpicture.

    Возвращает {ok, path, data_url} с путём до скопированного файла —
    именно он сохраняется в настройках темы и применяется на фоне.
    """
    src = Path(str(path or ""))
    if not src.exists() or not src.is_file():
        return {"ok": False, "error": "Исходный файл не найден"}
    try:
        SLPICTURE_DIR.mkdir(parents=True, exist_ok=True)
        ext = src.suffix.lower() or ".png"
        if ext not in _IMAGE_EXTS:
            ext = ".png"
        base = _safe_name(theme_name) if theme_name else src.stem
        # Уникальный суффикс, чтобы темы не затирали картинки друг друга.
        dest = SLPICTURE_DIR / f"{_safe_name(base)}_{uuid.uuid4().hex[:8]}{ext}"
        shutil.copy2(src, dest)
        return {"ok": True, "path": str(dest), "data_url": _data_url_for(dest)}
    except Exception as exc:
        logger.exception("Не удалось скопировать картинку в slpicture")
        return {"ok": False, "error": str(exc)}


# --------------------------------------------------------------------------- #
#  Доступ к таблице тем
# --------------------------------------------------------------------------- #
def _load_theme(theme_id: str):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT id, name, theme_bg, theme_panel, theme_text, theme_accent,
                   theme_accent2, theme_background_image, theme_json
            FROM themes WHERE id = ?
            """,
            (theme_id,),
        )
        row = cursor.fetchone()
    except Exception:
        row = None
    finally:
        conn.close()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "name": row[1],
        "theme_bg": row[2],
        "theme_panel": row[3],
        "theme_text": row[4],
        "theme_accent": row[5],
        "theme_accent2": row[6],
        "theme_background_image": row[7] or "",
        "theme_json": row[8] or "{}",
    }


def _unique_theme_name(base_name: str) -> str:
    conn = create_connection(db_path)
    cursor = conn.cursor()
    existing = set()
    try:
        cursor.execute("SELECT name FROM themes")
        existing = {row[0] for row in cursor.fetchall()}
    except Exception:
        existing = set()
    finally:
        conn.close()
    name = base_name
    counter = 2
    while name in existing:
        name = f"{base_name} ({counter})"
        counter += 1
    return name


# --------------------------------------------------------------------------- #
#  Экспорт темы
# --------------------------------------------------------------------------- #
@eel.expose
def share_theme(theme_id: str):
    """Упаковывает тему (цвета + картинка) в zip-архив."""
    theme_id = str(theme_id or "").strip()
    if not theme_id:
        return {"ok": False, "error": "Не указана тема"}

    theme = _load_theme(theme_id)
    if not theme:
        return {"ok": False, "error": "Тема не найдена в базе данных"}

    _report_theme_share(4, "Подготовка темы…", "Чтение настроек темы")

    try:
        theme_json_obj = json.loads(theme.get("theme_json") or "{}")
    except Exception:
        theme_json_obj = {}

    bg_value = theme.get("theme_background_image") or ""
    manifest = {
        "format": "slauncher-theme",
        "version": 1,
        "name": theme["name"],
        "theme_bg": theme["theme_bg"],
        "theme_panel": theme["theme_panel"],
        "theme_text": theme["theme_text"],
        "theme_accent": theme["theme_accent"],
        "theme_accent2": theme["theme_accent2"],
        "theme_json": theme_json_obj,
        "background_file": "",
        "background_url": "",
    }

    bg_path = None
    if _is_local_image(bg_value):
        candidate = Path(bg_value)
        if candidate.exists() and candidate.is_file():
            bg_path = candidate
            manifest["background_file"] = f"background/{candidate.name}"
    elif bg_value:
        manifest["background_url"] = bg_value

    try:
        SHARED_DIR.mkdir(parents=True, exist_ok=True)
        archive_path = SHARED_DIR / f"{_safe_name(theme['name'])}.sltheme.zip"
        _report_theme_share(20, "Создание архива…", f"Архив: {archive_path.name}")

        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                THEME_MANIFEST_NAME,
                json.dumps(manifest, ensure_ascii=False, indent=2),
            )
            if bg_path is not None:
                _report_theme_share(
                    60, "Упаковка изображения…", f"+ {bg_path.name}"
                )
                zf.write(bg_path, arcname=f"background/{bg_path.name}")

        _report_theme_share(100, "Готово", "Архив темы собран")
        return {
            "ok": True,
            "path": str(archive_path),
            "folder": str(SHARED_DIR),
        }
    except Exception as exc:
        logger.exception("Ошибка при упаковке темы %s", theme_id)
        return {"ok": False, "error": str(exc)}


@eel.expose
def open_theme_share_folder(path: str):
    """Открывает в проводнике папку с готовым архивом темы."""
    try:
        target = Path(str(path or ""))
        if target.is_file():
            target = target.parent
        if not target.exists():
            target = SHARED_DIR
            target.mkdir(parents=True, exist_ok=True)
        subprocess.run(["explorer", str(target)])
        return {"ok": True}
    except Exception as exc:
        logger.exception("Не удалось открыть папку с архивом темы")
        return {"ok": False, "error": str(exc)}


# --------------------------------------------------------------------------- #
#  Импорт темы
# --------------------------------------------------------------------------- #
@eel.expose
def pick_theme_archive():
    """Открывает диалог выбора архива темы. Возвращает путь или ''."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            title="Выберите архив темы",
            filetypes=[("Архивы тем", "*.zip"), ("Все файлы", "*.*")],
        )
        root.destroy()
        return path or ""
    except Exception:
        logger.exception("Не удалось открыть диалог выбора файла темы")
        return ""


@eel.expose
def receive_theme_archive(filename: str, base64_data: str):
    """Сохраняет загруженный через drag&drop архив темы во временную папку."""
    try:
        safe = Path(str(filename or "theme.zip")).name
        tmp_dir = Path(tempfile.gettempdir()) / "slauncher_theme_import"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        target = tmp_dir / safe
        raw = base64.b64decode(base64_data or "")
        target.write_bytes(raw)
        return {"ok": True, "path": str(target)}
    except Exception as exc:
        logger.exception("Не удалось сохранить загруженный архив темы")
        return {"ok": False, "error": str(exc)}


def _read_theme_manifest(zf: zipfile.ZipFile):
    try:
        with zf.open(THEME_MANIFEST_NAME) as f:
            return json.loads(f.read().decode("utf-8"))
    except KeyError:
        return None
    except Exception:
        logger.debug("Не удалось прочитать манифест архива темы", exc_info=True)
        return None


@eel.expose
def inspect_theme_archive(path: str):
    """Читает манифест архива темы и возвращает предпросмотр."""
    archive = Path(str(path or ""))
    if not archive.exists() or not zipfile.is_zipfile(archive):
        return {"ok": False, "error": "Файл не является ZIP-архивом"}
    try:
        with zipfile.ZipFile(archive, "r") as zf:
            manifest = _read_theme_manifest(zf)
    except Exception as exc:
        logger.exception("Ошибка чтения архива темы %s", path)
        return {"ok": False, "error": str(exc)}

    if not manifest or manifest.get("format") != "slauncher-theme":
        return {"ok": False, "error": "Неверный формат архива темы"}

    has_bg = bool(manifest.get("background_file") or manifest.get("background_url"))
    return {
        "ok": True,
        "manifest": {
            "name": manifest.get("name") or "Тема",
            "theme_bg": manifest.get("theme_bg") or "#0e1018",
            "theme_panel": manifest.get("theme_panel") or "#161826",
            "theme_text": manifest.get("theme_text") or "#e6e8f0",
            "theme_accent": manifest.get("theme_accent") or "#ffb86c",
            "theme_accent2": manifest.get("theme_accent2") or "#ff9a3c",
            "has_background": has_bg,
        },
    }


@eel.expose
def install_theme_archive(path: str):
    """Устанавливает тему из архива: распаковка картинки + сохранение темы."""
    from db.data import save_named_theme, update_theme_settings

    archive = Path(str(path or ""))
    if not archive.exists() or not zipfile.is_zipfile(archive):
        return {"ok": False, "error": "Файл не является ZIP-архивом"}

    try:
        with zipfile.ZipFile(archive, "r") as zf:
            manifest = _read_theme_manifest(zf)
            names = zf.namelist()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    if not manifest or manifest.get("format") != "slauncher-theme":
        return {"ok": False, "error": "Неверный формат архива темы"}

    _report_theme_import(10, "Чтение темы…", "Разбор манифеста")

    name = _unique_theme_name(str(manifest.get("name") or "Импортированная тема").strip())
    background_image = ""

    bg_file = manifest.get("background_file") or ""
    bg_url = manifest.get("background_url") or ""

    try:
        if bg_file and bg_file in names:
            _report_theme_import(40, "Распаковка изображения…", f"+ {bg_file}")
            SLPICTURE_DIR.mkdir(parents=True, exist_ok=True)
            orig = Path(bg_file).name
            ext = Path(orig).suffix.lower() or ".png"
            dest = SLPICTURE_DIR / f"{_safe_name(name)}_{uuid.uuid4().hex[:8]}{ext}"
            with zipfile.ZipFile(archive, "r") as zf, open(dest, "wb") as out:
                with zf.open(bg_file) as src:
                    shutil.copyfileobj(src, out)
            background_image = str(dest)
        elif bg_url:
            background_image = bg_url

        try:
            theme_json_obj = manifest.get("theme_json") or {}
            if not isinstance(theme_json_obj, dict):
                theme_json_obj = {}
        except Exception:
            theme_json_obj = {}

        payload = {
            "name": name,
            "theme_bg": manifest.get("theme_bg", "#0e1018"),
            "theme_panel": manifest.get("theme_panel", "#161826"),
            "theme_text": manifest.get("theme_text", "#e6e8f0"),
            "theme_accent": manifest.get("theme_accent", "#ffb86c"),
            "theme_accent2": manifest.get("theme_accent2", "#ff9a3c"),
            "theme_background_image": background_image,
            "theme_json": theme_json_obj,
        }

        _report_theme_import(80, "Сохранение темы…", f"Тема «{name}»")
        save_named_theme(payload)
        update_theme_settings(payload)

        _report_theme_import(100, "Готово", "Тема установлена")
        return {
            "ok": True,
            "theme_name": name,
            "theme": {
                "name": name,
                "theme_bg": payload["theme_bg"],
                "theme_panel": payload["theme_panel"],
                "theme_text": payload["theme_text"],
                "theme_accent": payload["theme_accent"],
                "theme_accent2": payload["theme_accent2"],
                "theme_background_image": background_image,
                "theme_json": json.dumps(theme_json_obj, ensure_ascii=False),
            },
        }
    except Exception as exc:
        logger.exception("Ошибка установки темы из архива")
        return {"ok": False, "error": str(exc)}
