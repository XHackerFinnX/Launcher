import os
import tkinter as tk
from tkinter import ttk

LOG_PATH = r"C:\.stoneworld\logs\launcher.log"
ICON_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "icon", "favicon.ico")
)
POLL_MS = 250
CHUNK_SIZE = 32768


class LogViewerApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("StoneWorld — Логи")
        self.root.geometry("980x620")
        try:
            self.root.iconbitmap(ICON_PATH)
        except Exception:
            pass

        self.position = 0

        toolbar = ttk.Frame(self.root)
        toolbar.pack(fill=tk.X, padx=8, pady=8)

        self.clear_btn = ttk.Button(toolbar, text="Очистить файл логов", command=self.clear_logs)
        self.clear_btn.pack(side=tk.LEFT)

        self.follow_var = tk.BooleanVar(value=True)
        self.follow_cb = ttk.Checkbutton(toolbar, text="Автопрокрутка", variable=self.follow_var)
        self.follow_cb.pack(side=tk.LEFT, padx=12)

        self.path_label = ttk.Label(toolbar, text=LOG_PATH)
        self.path_label.pack(side=tk.RIGHT)

        text_frame = ttk.Frame(self.root)
        text_frame.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0, 8))

        self.output = tk.Text(
            text_frame,
            wrap="word",
            bg="#111111",
            fg="#cfead1",
            insertbackground="#cfead1",
            font=("Consolas", 10),
        )
        self.output.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.scrollbar = ttk.Scrollbar(text_frame, orient=tk.VERTICAL, command=self.output.yview)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.output.configure(yscrollcommand=self.scrollbar.set)
        self.output.bind("<Control-l>", lambda _: self.clear_logs())

        self._tick()

    def clear_logs(self) -> None:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "w", encoding="utf-8"):
            pass
        self.position = 0
        self.output.delete("1.0", tk.END)

    def _tick(self) -> None:
        try:
            if not os.path.exists(LOG_PATH):
                os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
                with open(LOG_PATH, "w", encoding="utf-8"):
                    pass

            file_size = os.path.getsize(LOG_PATH)
            if self.position > file_size:
                self.position = 0
                self.output.delete("1.0", tk.END)

            collected_parts = []
            with open(LOG_PATH, "r", encoding="utf-8", errors="ignore") as log_file:
                log_file.seek(self.position)
                while True:
                    part = log_file.read(CHUNK_SIZE)
                    if not part:
                        break
                    collected_parts.append(part)
                self.position = log_file.tell()

            if collected_parts:
                text = "".join(collected_parts)
                self.output.insert(tk.END, text)
                if int(self.output.index("end-1c").split(".")[0]) > 10000:
                    self.output.delete("1.0", "1500.0")
                if self.follow_var.get():
                    self.output.see(tk.END)
        finally:
            self.root.after(POLL_MS, self._tick)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    LogViewerApp().run()