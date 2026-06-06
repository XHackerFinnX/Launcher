"""Экспорт и импорт пользовательских сборок (Поделиться / Загрузить).

Экспорт упаковывает моды, ресурспаки, шейдеры и миры сборки вместе с
манифестом в zip-архив. Импорт распаковывает архив, устанавливает ядро
(Forge/Fabric/Vanilla) и регистрирует сборку в лаунчере.
"""

import os
import json
import base64
import shutil
import zipfile
import logging
import tempfile
import subprocess
from pathlib import Path

import eel

from utils.config import minecraft_directory
from db.database import create_connection

logger = logging.getLogger(__name__)

db_path = r"C:\.stoneworld\db\launcher.db"
SHARED_DIR = Path(r"C:\.stoneworld\shared")
MANIFEST_NAME = "slauncher_share.json"

# Папки контента, которые переносим между сборками.
_CONTENT_FOLDERS = {
    "mod": ("mods", (".jar",)),
    "resourcepack": ("resourcepacks", (".zip",)),
    "shader": ("shaderpacks", (".zip",)),
}


def _version_dir(build_id: str) -> Path:
    return Path(minecraft_directory) / build_id


def _safe_name(name: str) -> str:
    keep = "-_.() абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    cleaned = "".join(ch for ch in str(name or "") if ch.isalnum() or ch in keep).strip()
    return cleaned or "build"


def _report_share(percent, stage=None, log=None):
    try:
        eel.updateShareProgress(percent, stage or "", log or "")
    except Exception:
        pass


def _report_import(percent, stage=None, log=None):
    try:
        eel.updateImportProgress(percent, stage or "", log or "")
    except Exception:
        pass


def _load_custom_build(build_id: str):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT build_id, name, description, game_version, loader, provider
            FROM custom_modpacks WHERE build_id = ?
            """,
            (build_id,),
        )
        row = cursor.fetchone()
    except Exception:
        row = None
    finally:
        conn.close()
    if not row:
        return None
    return {
        "build_id": row[0],
        "name": row[1],
        "description": row[2] or "",
        "version": row[3],
        "loader": row[4],
        "provider": row[5] or "modrinth",
    }


def _collect_files(version_dir: Path):
    """Возвращает {content_type: [Path, ...]} и список папок миров."""
    content = {}
    for ctype, (folder, exts) in _CONTENT_FOLDERS.items():
        folder_path = version_dir / folder
        items = []
        if folder_path.exists():
            for file in sorted(folder_path.iterdir()):
                if file.is_file() and file.suffix.lower() in exts:
                    items.append(file)
        content[ctype] = items
    worlds = []
    saves = version_dir / "saves"
    if saves.exists():
        for entry in sorted(saves.iterdir()):
            if entry.is_dir() and (entry / "level.dat").exists():
                worlds.append(entry)
    return content, worlds


@eel.expose
def share_build(build_id: str):
    """Упаковывает сборку в zip-архив со всем контентом и манифестом."""
    build_id = str(build_id or "").strip()
    if not build_id:
        return {"ok": False, "error": "Не указана сборка"}

    build = _load_custom_build(build_id)
    if not build:
        return {"ok": False, "error": "Сборка не найдена в базе данных"}

    version_dir = _version_dir(build_id)
    if not version_dir.exists():
        return {"ok": False, "error": "Сборка не установлена — нечего упаковывать"}

    _report_share(2, "Сканирование файлов…", "Поиск контента сборки")
    content, worlds = _collect_files(version_dir)

    counts = {ctype: len(items) for ctype, items in content.items()}
    counts["worlds"] = len(worlds)

    manifest = {
        "format": "slauncher-build",
        "version": 1,
        "name": build["name"],
        "description": build["description"],
        "game_version": build["version"],
        "loader": build["loader"],
        "provider": build["provider"],
        "counts": counts,
    }

    # Считаем общее число элементов для прогресса.
    total_items = sum(len(items) for items in content.values()) + len(worlds)
    done_items = 0

    try:
        SHARED_DIR.mkdir(parents=True, exist_ok=True)
        archive_path = SHARED_DIR / f"{_safe_name(build['name'])}.slpack.zip"
        _report_share(5, "Создание архива…", f"Архив: {archive_path.name}")

        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2))

            for ctype, (folder, _exts) in _CONTENT_FOLDERS.items():
                for file in content[ctype]:
                    zf.write(file, arcname=f"{folder}/{file.name}")
                    done_items += 1
                    pct = 5 + (done_items / total_items * 90) if total_items else 95
                    _report_share(pct, "Упаковка контента…", f"+ {folder}/{file.name}")

            for world in worlds:
                for root, _dirs, files in os.walk(world):
                    for fname in files:
                        full = Path(root) / fname
                        rel = full.relative_to(version_dir)
                        zf.write(full, arcname=str(rel).replace("\\", "/"))
                done_items += 1
                pct = 5 + (done_items / total_items * 90) if total_items else 95
                _report_share(pct, "Упаковка миров…", f"+ saves/{world.name}")

        _report_share(100, "Готово", "Архив собран")
        return {
            "ok": True,
            "path": str(archive_path),
            "folder": str(SHARED_DIR),
            "counts": counts,
        }
    except Exception as exc:
        logger.exception("Ошибка при упаковке сборки %s", build_id)
        return {"ok": False, "error": str(exc)}


@eel.expose
def open_share_folder(path: str):
    """Открывает в проводнике папку с готовым архивом сборки."""
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
        logger.exception("Не удалось открыть папку с архивом")
        return {"ok": False, "error": str(exc)}


@eel.expose
def pick_build_archive():
    """Открывает диалог выбора файла архива сборки. Возвращает путь или ''."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            title="Выберите архив сборки",
            filetypes=[("Архивы сборок", "*.zip"), ("Все файлы", "*.*")],
        )
        root.destroy()
        return path or ""
    except Exception:
        logger.exception("Не удалось открыть диалог выбора файла")
        return ""


@eel.expose
def receive_build_archive(filename: str, base64_data: str):
    """Сохраняет загруженный через drag&drop архив во временную папку."""
    try:
        safe = Path(str(filename or "build.zip")).name
        tmp_dir = Path(tempfile.gettempdir()) / "slauncher_import"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        target = tmp_dir / safe
        raw = base64.b64decode(base64_data or "")
        target.write_bytes(raw)
        return {"ok": True, "path": str(target)}
    except Exception as exc:
        logger.exception("Не удалось сохранить загруженный архив")
        return {"ok": False, "error": str(exc)}


def _read_manifest(zf: zipfile.ZipFile):
    try:
        with zf.open(MANIFEST_NAME) as f:
            return json.loads(f.read().decode("utf-8"))
    except KeyError:
        return None
    except Exception:
        logger.debug("Не удалось прочитать манифест архива", exc_info=True)
        return None


@eel.expose
def inspect_build_archive(path: str):
    """Читает манифест архива и считает количество файлов по категориям."""
    archive = Path(str(path or ""))
    if not archive.exists() or not zipfile.is_zipfile(archive):
        return {"ok": False, "error": "Файл не является ZIP-архивом"}
    try:
        with zipfile.ZipFile(archive, "r") as zf:
            manifest = _read_manifest(zf)
            names = zf.namelist()
    except Exception as exc:
        logger.exception("Ошибка чтения архива %s", path)
        return {"ok": False, "error": str(exc)}

    if not manifest or manifest.get("format") != "slauncher-build":
        return {"ok": False, "error": "Неверный формат архива сборки"}

    counts = {"mod": 0, "resourcepack": 0, "shader": 0, "worlds": 0}
    world_set = set()
    for name in names:
        lower = name.lower()
        if lower.startswith("mods/") and lower.endswith(".jar"):
            counts["mod"] += 1
        elif lower.startswith("resourcepacks/") and lower.endswith(".zip"):
            counts["resourcepack"] += 1
        elif lower.startswith("shaderpacks/") and lower.endswith(".zip"):
            counts["shader"] += 1
        elif lower.startswith("saves/"):
            parts = name.split("/")
            if len(parts) >= 2 and parts[1]:
                world_set.add(parts[1])
    counts["worlds"] = len(world_set)

    return {
        "ok": True,
        "manifest": {
            "name": manifest.get("name") or "Сборка",
            "version": manifest.get("game_version") or manifest.get("version") or "",
            "loader": manifest.get("loader") or "vanilla",
            "description": manifest.get("description") or "",
        },
        "counts": counts,
    }


def _register_custom_build(build_id, name, description, game_version, loader, provider):
    conn = create_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute('''CREATE TABLE IF NOT EXISTS custom_modpacks (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            build_id TEXT NOT NULL UNIQUE,
                            name TEXT NOT NULL UNIQUE,
                            description TEXT DEFAULT '',
                            game_version TEXT NOT NULL,
                            loader TEXT NOT NULL,
                            provider TEXT DEFAULT 'modrinth',
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
        cursor.execute(
            """
            INSERT INTO custom_modpacks (build_id, name, description, game_version, loader, provider)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(build_id) DO UPDATE SET
                description = excluded.description,
                game_version = excluded.game_version,
                loader = excluded.loader,
                provider = excluded.provider,
                updated_at = CURRENT_TIMESTAMP
            """,
            (build_id, name, description, game_version, loader, provider),
        )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        logger.exception("Не удалось зарегистрировать импортированную сборку %s", build_id)
        return False
    finally:
        conn.close()


def _unique_build_name(base_name: str) -> str:
    """Гарантирует уникальность имени сборки (custom_modpacks.name UNIQUE)."""
    conn = create_connection(db_path)
    cursor = conn.cursor()
    existing = set()
    try:
        cursor.execute("SELECT name FROM custom_modpacks")
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


@eel.expose
def install_build_archive(path: str):
    """Устанавливает сборку из архива: ядро + контент + регистрация."""
    # Локальный импорт во избежание циклических зависимостей при старте.
    from utils.download import minecraft_download_version_build
    from db.data import insert_version

    archive = Path(str(path or ""))
    if not archive.exists() or not zipfile.is_zipfile(archive):
        return {"ok": False, "error": "Файл не является ZIP-архивом"}

    try:
        with zipfile.ZipFile(archive, "r") as zf:
            manifest = _read_manifest(zf)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    if not manifest or manifest.get("format") != "slauncher-build":
        return {"ok": False, "error": "Неверный формат архива сборки"}

    name = _unique_build_name(str(manifest.get("name") or "Импортированная сборка").strip())
    game_version = str(manifest.get("game_version") or "").strip()
    loader = str(manifest.get("loader") or "vanilla").strip().lower()
    description = str(manifest.get("description") or "").strip()
    provider = str(manifest.get("provider") or "modrinth").strip().lower() or "modrinth"

    if not game_version:
        return {"ok": False, "error": "В манифесте не указана версия Minecraft"}

    loader_label = "Fabric" if loader == "fabric" else ("Forge" if loader == "forge" else "Vanilla")
    build_id = f"{name} {loader_label} {game_version}".strip()
    version_dir = _version_dir(build_id)

    try:
        _report_import(3, "Установка ядра…", f"Minecraft {game_version} / {loader_label}")
        # Установка ядра (Forge/Fabric/Vanilla). Прогресс ядра идёт по своему каналу.
        minecraft_download_version_build(build_id)
        _report_import(55, "Ядро установлено", "Распаковка контента из архива")

        # Распаковка контента и миров.
        with zipfile.ZipFile(archive, "r") as zf:
            members = [m for m in zf.namelist() if not m.endswith("/")]
            allowed_prefixes = ("mods/", "resourcepacks/", "shaderpacks/", "saves/")
            members = [m for m in members if m.lower().startswith(allowed_prefixes)]
            total = len(members) or 1
            for idx, member in enumerate(members, start=1):
                # Защита от path traversal.
                dest = (version_dir / member).resolve()
                try:
                    dest.relative_to(version_dir.resolve())
                except ValueError:
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as src, open(dest, "wb") as out:
                    shutil.copyfileobj(src, out)
                pct = 55 + (idx / total * 40)
                _report_import(pct, "Распаковка контента…", f"+ {member}")

        _report_import(97, "Регистрация сборки…", "Добавление в список версий")
        _register_custom_build(build_id, name, description, game_version, loader, provider)
        try:
            insert_version(build_id)
        except Exception:
            logger.debug("Не удалось добавить версию %s в список", build_id, exc_info=True)

        _report_import(100, "Готово", "Сборка установлена")
        return {"ok": True, "build_name": name, "build_id": build_id}
    except Exception as exc:
        logger.exception("Ошибка установки сборки из архива")
        # Чистим частично установленную версию.
        try:
            if version_dir.exists():
                shutil.rmtree(version_dir)
        except OSError:
            pass
        return {"ok": False, "error": str(exc)}
