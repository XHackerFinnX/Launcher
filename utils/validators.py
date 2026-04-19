import re


LOGIN_RE = re.compile(r"^[A-Za-z0-9_]{3,16}$")
SERVER_RE = re.compile(
    r"^(([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?$"
)


def is_valid_login(login: str) -> bool:
    return bool(LOGIN_RE.fullmatch(login.strip()))


def is_valid_server_address(address: str) -> bool:
    value = address.strip()
    if not value or len(value) > 255:
        return False
    return bool(SERVER_RE.fullmatch(value))