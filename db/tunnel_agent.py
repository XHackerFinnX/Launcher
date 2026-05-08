import json
import logging
import socket
import threading
import time
from typing import Dict, Optional

import requests

logger = logging.getLogger(__name__)


class TunnelAgent:
    """TCP tunnel agent that bridges relay socket <-> local minecraft socket."""

    def __init__(self, relay_host: str, relay_port: int, agent_token: str, minecraft_port: int, room_id: str):
        self.relay_host = relay_host
        self.relay_port = int(relay_port)
        self.agent_token = agent_token
        self.minecraft_port = int(minecraft_port)
        self.room_id = room_id
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._state: Dict[str, str] = {"status": "idle", "error": ""}

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"tunnel-agent-{self.room_id}")
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._state["status"] = "stopped"

    def status(self):
        return dict(self._state)

    def _pump(self, a: socket.socket, b: socket.socket):
        def copy(src, dst):
            try:
                while not self._stop.is_set():
                    data = src.recv(65536)
                    if not data:
                        break
                    dst.sendall(data)
            except OSError:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_WR)
                except OSError:
                    pass

        t1 = threading.Thread(target=copy, args=(a, b), daemon=True)
        t2 = threading.Thread(target=copy, args=(b, a), daemon=True)
        t1.start(); t2.start()
        t1.join(); t2.join()

    def _run(self):
        self._state["status"] = "connecting"
        while not self._stop.is_set():
            try:
                relay = socket.create_connection((self.relay_host, self.relay_port), timeout=10)
                hello = {
                    "type": "agent",
                    "token": self.agent_token,
                    "room_id": self.room_id,
                }
                relay.sendall((json.dumps(hello) + "\n").encode("utf-8"))
                self._state["status"] = "agent_online"

                local_mc = socket.create_connection(("127.0.0.1", self.minecraft_port), timeout=10)
                self._state["status"] = "relay_connected"
                self._pump(relay, local_mc)
            except OSError as exc:
                self._state["status"] = "relay_error"
                self._state["error"] = str(exc)
                time.sleep(2)
            finally:
                for s in (locals().get("relay"), locals().get("local_mc")):
                    if s:
                        try:
                            s.close()
                        except OSError:
                            pass


def relay_smoke_test(relay_host: str, relay_port: int, timeout: float = 2.0):
    try:
        with socket.create_connection((relay_host, int(relay_port)), timeout=timeout):
            return {"ok": True}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


class RelayClientProxy:
    """Local TCP listener for peers: Minecraft connects to 127.0.0.1:local_port."""

    def __init__(self, relay_host: str, relay_port: int, room_id: str, join_token: str, local_port: int = 25595):
        self.relay_host = relay_host
        self.relay_port = int(relay_port)
        self.room_id = room_id
        self.join_token = join_token
        self.local_port = int(local_port)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _run(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("127.0.0.1", self.local_port))
        srv.listen(10)
        srv.settimeout(1.0)
        while not self._stop.is_set():
            try:
                client, _ = srv.accept()
            except OSError:
                continue
            relay = socket.create_connection((self.relay_host, self.relay_port), timeout=10)
            hello = {"type": "client", "room_id": self.room_id, "join_token": self.join_token}
            relay.sendall((json.dumps(hello) + "\n").encode("utf-8"))
            TunnelAgent._pump(self, client, relay)