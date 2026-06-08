import os
import platform
import subprocess
import uuid
from pathlib import Path

import eel

from utils.config import VERSIONS_LAUNCHER

LOG_PATH = Path(r"C:\.stoneworld\logs\launcher.log")
SYSTEM_ID_PATH = Path(r"C:\.stoneworld\db\system_id.txt")
MAX_LOG_LINES = 80
MAX_LOG_BYTES = 64_000


def _get_or_create_system_id() -> str:
    try:
        if SYSTEM_ID_PATH.exists():
            value = SYSTEM_ID_PATH.read_text(encoding="utf-8").strip()
            if value:
                return value

        SYSTEM_ID_PATH.parent.mkdir(parents=True, exist_ok=True)
        value = uuid.uuid4().hex
        SYSTEM_ID_PATH.write_text(value, encoding="utf-8")
        return value
    except OSError:
        return f"volatile-{uuid.getnode():012x}"


def _tail_log_lines(path: Path, max_lines: int = MAX_LOG_LINES) -> list[str]:
    if not path.exists() or not path.is_file():
        return []

    with path.open("rb") as file:
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(max(0, size - MAX_LOG_BYTES), os.SEEK_SET)
        text = file.read().decode("utf-8", errors="ignore")

    return text.splitlines()[-max_lines:]


def _java_version() -> str:
    startupinfo = None
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=4,
            startupinfo=startupinfo,
        )
    except (OSError, subprocess.SubprocessError):
        return ""

    output = "\n".join(part for part in (result.stderr, result.stdout) if part).strip()
    return output.splitlines()[0] if output else ""


@eel.expose
def get_launcher_feedback_system_id():
    """Return stable launcher installation id used for feedback throttling."""
    return _get_or_create_system_id()


@eel.expose
def get_launcher_feedback_technical_info():
    """Return non-sensitive diagnostics that can be attached to feedback."""
    return {
        "system_id": _get_or_create_system_id(),
        "launcher_version": VERSIONS_LAUNCHER,
        "os": platform.platform(),
        "system": platform.system(),
        "system_version": platform.version(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "java_version": _java_version(),
        "log_tail": _tail_log_lines(LOG_PATH),
    }