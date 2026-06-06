"""Чтение миров Minecraft из папки saves конкретной сборки.

Модуль содержит минимальный парсер NBT (на стандартной библиотеке),
чтобы вытащить из level.dat название мира, версию, режим игры и т.п.
"""

import os
import struct
import gzip
import base64
import logging
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import eel

from utils.config import minecraft_directory

logger = logging.getLogger(__name__)

# Типы тегов NBT
TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12


class _NBTReader:
    """Простейший последовательный парсер несжатого NBT."""

    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def _read(self, fmt: str):
        size = struct.calcsize(fmt)
        value = struct.unpack_from(fmt, self.data, self.pos)
        self.pos += size
        return value[0] if len(value) == 1 else value

    def _read_string(self):
        length = self._read(">H")
        raw = self.data[self.pos:self.pos + length]
        self.pos += length
        return raw.decode("utf-8", errors="replace")

    def _read_payload(self, tag_type):
        if tag_type == TAG_BYTE:
            return self._read(">b")
        if tag_type == TAG_SHORT:
            return self._read(">h")
        if tag_type == TAG_INT:
            return self._read(">i")
        if tag_type == TAG_LONG:
            return self._read(">q")
        if tag_type == TAG_FLOAT:
            return self._read(">f")
        if tag_type == TAG_DOUBLE:
            return self._read(">d")
        if tag_type == TAG_BYTE_ARRAY:
            length = self._read(">i")
            raw = self.data[self.pos:self.pos + length]
            self.pos += length
            return raw
        if tag_type == TAG_STRING:
            return self._read_string()
        if tag_type == TAG_LIST:
            item_type = self._read(">b")
            length = self._read(">i")
            return [self._read_payload(item_type) for _ in range(max(0, length))]
        if tag_type == TAG_COMPOUND:
            compound = {}
            while True:
                child_type = self._read(">b")
                if child_type == TAG_END:
                    break
                name = self._read_string()
                compound[name] = self._read_payload(child_type)
            return compound
        if tag_type == TAG_INT_ARRAY:
            length = self._read(">i")
            return [self._read(">i") for _ in range(max(0, length))]
        if tag_type == TAG_LONG_ARRAY:
            length = self._read(">i")
            return [self._read(">q") for _ in range(max(0, length))]
        raise ValueError(f"Неизвестный тег NBT: {tag_type}")

    def parse(self):
        root_type = self._read(">b")
        if root_type != TAG_COMPOUND:
            return {}
        self._read_string()  # имя корневого тега (обычно пустое)
        return self._read_payload(TAG_COMPOUND)


def _parse_level_dat(path: Path) -> dict:
    """Возвращает словарь Data из level.dat или пустой dict."""
    try:
        with open(path, "rb") as file:
            raw = file.read()
        # level.dat почти всегда gzip-сжат.
        try:
            raw = gzip.decompress(raw)
        except OSError:
            pass  # на случай несжатого файла
        root = _NBTReader(raw).parse()
        return root.get("Data", {}) if isinstance(root, dict) else {}
    except Exception:
        logger.debug("Не удалось прочитать level.dat: %s", path, exc_info=True)
        return {}


def _folder_size(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def _format_size(num: int) -> str:
    value = float(num)
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if value < 1024 or unit == "ГБ":
            return f"{value:.0f} {unit}" if unit == "Б" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} ГБ"


def _saves_dir(version_name: str) -> Path:
    return Path(minecraft_directory) / version_name / "saves"


def _icon_data_url(icon_path: Path) -> str:
    """Кодирует icon.png мира в data-URL, чтобы показать его в интерфейсе."""
    try:
        if icon_path.exists() and icon_path.stat().st_size <= 2 * 1024 * 1024:
            encoded = base64.b64encode(icon_path.read_bytes()).decode("ascii")
            return f"data:image/png;base64,{encoded}"
    except Exception:
        logger.debug("Не удалось прочитать иконку мира: %s", icon_path, exc_info=True)
    return ""


@eel.expose
def list_worlds(version_name: str):
    """Список миров в папке saves сборки с метаданными из level.dat."""
    saves = _saves_dir(version_name)
    if not saves.exists():
        return []

    worlds = []
    for entry in sorted(saves.iterdir()):
        if not entry.is_dir():
            continue
        level_dat = entry / "level.dat"
        if not level_dat.exists():
            continue

        data = _parse_level_dat(level_dat)
        version_info = data.get("Version", {}) if isinstance(data.get("Version"), dict) else {}
        last_played_ms = data.get("LastPlayed")
        last_played = ""
        if isinstance(last_played_ms, int) and last_played_ms > 0:
            try:
                last_played = datetime.fromtimestamp(
                    last_played_ms / 1000, tz=timezone.utc
                ).astimezone().strftime("%d.%m.%Y")
            except (ValueError, OSError, OverflowError):
                last_played = ""

        size_bytes = _folder_size(entry)
        worlds.append({
            "folder": entry.name,
            "name": data.get("LevelName") or entry.name,
            "version": version_info.get("Name") or "",
            "gamemode": data.get("GameType"),
            "hardcore": bool(data.get("hardcore")),
            "last_played": last_played,
            "size_bytes": size_bytes,
            "size_label": _format_size(size_bytes),
            "icon": _icon_data_url(entry / "icon.png"),
        })
    return worlds


@eel.expose
def open_saves_folder(version_name: str):
    """Открывает папку saves сборки в проводнике (создаёт при отсутствии)."""
    saves = _saves_dir(version_name)
    try:
        saves.mkdir(parents=True, exist_ok=True)
        subprocess.run(["explorer", str(saves)])
        return {"ok": True}
    except Exception as exc:
        logger.exception("Не удалось открыть папку saves для %s", version_name)
        return {"ok": False, "error": str(exc)}


@eel.expose
def delete_world(version_name: str, folder_name: str):
    """Удаляет папку мира из saves сборки."""
    saves = _saves_dir(version_name)
    target = saves / Path(str(folder_name or "")).name
    # Защита: цель обязана находиться внутри saves.
    try:
        target.resolve().relative_to(saves.resolve())
    except (ValueError, OSError):
        return {"ok": False, "error": "Некорректный путь"}
    if not target.exists() or not target.is_dir():
        return {"ok": False, "error": "Мир не найден"}
    try:
        shutil.rmtree(target)
        return {"ok": True}
    except Exception as exc:
        logger.exception("Не удалось удалить мир %s", folder_name)
        return {"ok": False, "error": str(exc)}
