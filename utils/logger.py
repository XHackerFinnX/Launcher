import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logging() -> None:
    log_dir = r"C:\.stoneworld\logs"
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "launcher.log")

    root_logger = logging.getLogger()
    if root_logger.handlers:
        return

    root_logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    file_handler = RotatingFileHandler(
        log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    root_logger.addHandler(file_handler)
    root_logger.addHandler(stream_handler)

    # Во время массовой загрузки minecraft_launcher_lib может открывать
    # много соединений; эти WARNING не критичны и зашумляют лог.
    logging.getLogger("urllib3.connectionpool").setLevel(logging.ERROR)