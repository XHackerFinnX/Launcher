import os
import re
import subprocess
from pathlib import Path
from typing import Optional


def _run_java_version(java_path: str) -> Optional[str]:
    """
    Возвращает вывод java -version.
    Java пишет версию в stderr, поэтому читаем stderr + stdout.
    """
    try:
        result = subprocess.run(
            [java_path, "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return (result.stderr or "") + (result.stdout or "")
    except Exception:
        return None


def _is_java_8(java_path: str) -> bool:
    output = _run_java_version(java_path)
    if not output:
        return False

    # Примеры:
    # java version "1.8.0_401"
    # openjdk version "1.8.0_402"
    return bool(re.search(r'version\s+"1\.8\.', output, re.IGNORECASE))


def _java_executable_from_home(java_home: str, prefer_javaw: bool = True) -> Optional[str]:
    if not java_home:
        return None

    java_home_path = Path(java_home)

    candidates = []

    if prefer_javaw:
        candidates.append(java_home_path / "bin" / "javaw.exe")
        candidates.append(java_home_path / "bin" / "java.exe")
    else:
        candidates.append(java_home_path / "bin" / "java.exe")
        candidates.append(java_home_path / "bin" / "javaw.exe")

    for candidate in candidates:
        if candidate.exists() and _is_java_8(str(candidate)):
            return str(candidate)

    return None


def _find_java_8_from_env(prefer_javaw: bool = True) -> Optional[str]:
    for env_name in ("JAVA_HOME", "JRE_HOME"):
        java_home = os.environ.get(env_name)
        found = _java_executable_from_home(java_home, prefer_javaw)
        if found:
            return found

    return None


def _find_java_8_from_registry(prefer_javaw: bool = True) -> Optional[str]:
    if os.name != "nt":
        return None

    try:
        import winreg
    except Exception:
        return None

    registry_paths = [
        r"SOFTWARE\JavaSoft\Java Runtime Environment",
        r"SOFTWARE\JavaSoft\Java Development Kit",
        r"SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment",
        r"SOFTWARE\WOW6432Node\JavaSoft\Java Development Kit",
        r"SOFTWARE\Eclipse Adoptium\JRE",
        r"SOFTWARE\Eclipse Adoptium\JDK",
        r"SOFTWARE\WOW6432Node\Eclipse Adoptium\JRE",
        r"SOFTWARE\WOW6432Node\Eclipse Adoptium\JDK",
    ]

    roots = [
        winreg.HKEY_LOCAL_MACHINE,
        winreg.HKEY_CURRENT_USER,
    ]

    for root in roots:
        for base_path in registry_paths:
            try:
                with winreg.OpenKey(root, base_path) as base_key:
                    subkey_count = winreg.QueryInfoKey(base_key)[0]

                    for i in range(subkey_count):
                        try:
                            version_name = winreg.EnumKey(base_key, i)

                            # Нас интересуют версии Java 8:
                            # 1.8, 1.8.0_XXX, 8, 8.0.XXX
                            if not (
                                version_name.startswith("1.8")
                                or version_name.startswith("8")
                                or "8" in version_name
                            ):
                                continue

                            with winreg.OpenKey(base_key, version_name) as version_key:
                                java_home = None

                                for value_name in ("JavaHome", "Path", "InstallationPath"):
                                    try:
                                        java_home, _ = winreg.QueryValueEx(version_key, value_name)
                                        break
                                    except FileNotFoundError:
                                        pass

                                found = _java_executable_from_home(java_home, prefer_javaw)
                                if found:
                                    return found

                        except Exception:
                            continue

            except Exception:
                continue

    return None


def _find_java_8_from_common_dirs(prefer_javaw: bool = True) -> Optional[str]:
    if os.name != "nt":
        return None

    base_dirs = [
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("LOCALAPPDATA"),
    ]

    vendor_dirs = [
        "Java",
        "Eclipse Adoptium",
        "Adoptium",
        "Amazon Corretto",
        "BellSoft",
        "Zulu",
        "Microsoft",
        "Semeru",
    ]

    possible_homes = []

    for base_dir in base_dirs:
        if not base_dir:
            continue

        base_path = Path(base_dir)

        for vendor in vendor_dirs:
            vendor_path = base_path / vendor
            if not vendor_path.exists():
                continue

            try:
                for child in vendor_path.iterdir():
                    name = child.name.lower()

                    # jre1.8.0_XXX, jdk1.8.0_XXX, jdk8uXXX, jre8uXXX и т.п.
                    if (
                        child.is_dir()
                        and (
                            "1.8" in name
                            or "8u" in name
                            or "jdk8" in name
                            or "jre8" in name
                            or "jdk-8" in name
                            or "jre-8" in name
                        )
                    ):
                        possible_homes.append(child)
            except Exception:
                continue

    for home in possible_homes:
        found = _java_executable_from_home(str(home), prefer_javaw)
        if found:
            return found

    return None


def _find_java_8_from_where(prefer_javaw: bool = True) -> Optional[str]:
    if os.name != "nt":
        return None

    try:
        result = subprocess.run(
            ["where", "java"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

        paths = result.stdout.splitlines()

        for java_path in paths:
            java_path = java_path.strip()
            if not java_path:
                continue

            java_exe = Path(java_path)

            candidates = []

            if prefer_javaw:
                candidates.append(java_exe.with_name("javaw.exe"))
                candidates.append(java_exe)
            else:
                candidates.append(java_exe)
                candidates.append(java_exe.with_name("javaw.exe"))

            for candidate in candidates:
                if candidate.exists() and _is_java_8(str(candidate)):
                    return str(candidate)

    except Exception:
        return None

    return None


def find_java_8(prefer_javaw: bool = True) -> Optional[str]:
    """
    Ищет Java 8 и возвращает полный путь к javaw.exe или java.exe.

    prefer_javaw=True — лучше для запуска Minecraft без консольного окна.
    prefer_javaw=False — удобно для отладки, потому что видно вывод в консоль.
    """

    search_methods = [
        _find_java_8_from_env,
        _find_java_8_from_registry,
        _find_java_8_from_common_dirs,
        _find_java_8_from_where,
    ]

    for method in search_methods:
        found = method(prefer_javaw=prefer_javaw)
        if found:
            return found

    return None