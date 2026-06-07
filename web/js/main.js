/* ============================================
   StoneLauncher 2.0 — main.js
   Сохранены все вызовы eel.* для совместимости
   с существующим Python-бэкендом.
   ============================================ */

// ---------- Sidebar navigation ----------
document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", () => {
        const active = document.querySelector(".menu-item.active");
        if (active) active.classList.remove("active");
        item.classList.add("active");

        const sectionId = item.getAttribute("data-section");
        const activeSection = document.querySelector(".content-section.active");
        if (activeSection) activeSection.classList.remove("active");
        const target = document.getElementById(sectionId);
        if (target) target.classList.add("active");

        // Скролл к началу секции
        document.querySelector(".content").scrollTop = 0;
    });
});

// Hero "jump to section" buttons
document.querySelectorAll("[data-jump-section]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-jump-section");
        const menuItem = document.querySelector(
            `.menu-item[data-section="${id}"]`,
        );
        if (menuItem) menuItem.click();
    });
});

// ---------- Toast notifications ----------
function toast({ title, message = "", type = "info", duration = 3500 }) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const icon =
        type === "success"
            ? "fa-circle-check"
            : type === "error"
              ? "fa-circle-exclamation"
              : "fa-circle-info";
    el.innerHTML = `
        <i class="fas ${icon}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ""}
        </div>
    `;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add("removing");
        setTimeout(() => el.remove(), 200);
    }, duration);
}

// ---------- Generic confirm dialog ----------
function showConfirmDialog({
    title,
    message,
    confirmText = "Подтвердить",
    cancelText = "Отмена",
    danger = false,
}) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay";
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-icon ${danger ? "danger" : ""}">
                    <i class="fas ${danger ? "fa-triangle-exclamation" : "fa-circle-question"}"></i>
                </div>
                <h3 class="confirm-title">${escapeHtml(title)}</h3>
                <p class="confirm-message">${escapeHtml(message)}</p>
                <div class="confirm-actions">
                    <button class="confirm-cancel">${escapeHtml(cancelText)}</button>
                    <button class="confirm-ok ${danger ? "danger" : ""}">${escapeHtml(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("visible"));

        const close = (result) => {
            overlay.classList.remove("visible");
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        };
        overlay
            .querySelector(".confirm-cancel")
            .addEventListener("click", () => close(false));
        overlay
            .querySelector(".confirm-ok")
            .addEventListener("click", () => close(true));
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close(false);
        });
    });
}

// ---------- Mod dependency selection dialog ----------
// Возвращает: null (отмена) | массив project_id для установки
function showDependencyDialog({ modName, dependencies }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay dep-overlay";

        const rows = dependencies
            .map((dep) => {
                const installed = dep.already_installed;
                return `
                <label class="dep-row ${installed ? "installed" : ""}">
                    <input type="checkbox" class="dep-check" data-id="${escapeHtml(dep.project_id)}" ${installed ? "disabled" : "checked"} />
                    <span class="dep-icon">${dep.icon ? `<img src="${escapeHtml(dep.icon)}" alt="">` : '<i class="fas fa-puzzle-piece"></i>'}</span>
                    <span class="dep-info">
                        <span class="dep-name">${escapeHtml(dep.title)}</span>
                        <span class="dep-desc">${escapeHtml(dep.description || "")}</span>
                    </span>
                    ${installed ? '<span class="dep-status"><i class="fas fa-check"></i> Уже установлен</span>' : ""}
                </label>`;
            })
            .join("");

        overlay.innerHTML = `
            <div class="confirm-dialog dep-dialog">
                <div class="dep-header">
                    <div class="confirm-icon">
                        <i class="fas fa-diagram-project"></i>
                    </div>
                    <div>
                        <h3 class="confirm-title">Нужны дополнительные моды</h3>
                        <p class="confirm-message">Для работы «${escapeHtml(modName)}» рекомендуется установить зависимости. Снимите галочки с тех, что не нужны.</p>
                    </div>
                </div>
                <div class="dep-list">${rows}</div>
                <div class="confirm-actions dep-actions">
                    <button class="confirm-cancel">Отменить</button>
                    <button class="dep-install-selected">Установить выбранные</button>
                    <button class="confirm-ok dep-install-all">Установить все</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("visible"));

        const close = (result) => {
            overlay.classList.remove("visible");
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        };
        const allIds = dependencies
            .filter((d) => !d.already_installed)
            .map((d) => d.project_id);

        overlay
            .querySelector(".confirm-cancel")
            .addEventListener("click", () => close([]));
        overlay
            .querySelector(".dep-install-all")
            .addEventListener("click", () => close(allIds));
        overlay
            .querySelector(".dep-install-selected")
            .addEventListener("click", () => {
                const checked = [
                    ...overlay.querySelectorAll(".dep-check:checked"),
                ].map((c) => c.dataset.id);
                close(checked);
            });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close([]);
        });
    });
}

function setStartupLoaderText(text) {
    const textEl = document.getElementById("startup-loader-text");
    if (textEl) textEl.textContent = text;
}

function hideStartupLoader() {
    const loader = document.getElementById("startup-loader");
    if (!loader) return;
    loader.classList.add("hidden");
    setTimeout(() => loader.remove(), 450);
}

function updateIntegrityProgress(payload) {
    const progressMessage = document.getElementById(
        "integrity-progress-message",
    );
    const inlineLoader = document.getElementById("integrity-inline-loader");
    if (!progressMessage) return;

    const checked = Number(payload?.checked ?? 0);
    const total = Number(payload?.total ?? 0);
    const fileName = payload?.file ? ` (${payload.file})` : "";
    const status = payload?.status || "ok";

    if (payload?.message) {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. ${payload.message}`;
    } else if (status === "installing") {
        if (inlineLoader) inlineLoader.style.display = "inline-flex";
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Установка...`;
    } else if (status === "updating") {
        if (inlineLoader) inlineLoader.style.display = "inline-flex";
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Обновление...`;
    } else if (status === "waiting_close") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Ожидание закрытия процесса...`;
    } else if (status === "closing") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Закрытие процесса...`;
    } else if (status === "installed") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Установлено.`;
    } else if (status === "updated") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Обновлено.`;
    } else if (status === "error") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Ошибка установки.`;
    } else if (status === "skipped") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Запись пропущена.`;
    } else {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}.`;
    }

    progressMessage.style.display = "block";
}

try {
    eel.expose(updateIntegrityProgress);
} catch (e) {}

const activeIntegrityProcessCloseRequests = new Set();
let integrityProcessClosePollTimer = null;

function buildIntegrityProcessRows(processes, fileName) {
    if (!processes.length) {
        return `<li><i class="fas fa-file"></i><span>${escapeHtml(fileName)}</span></li>`;
    }

    return processes
        .map((process) => {
            const name = process?.name || fileName;
            const pid = process?.pid ? `PID: ${process.pid}` : "PID неизвестен";
            const exe = process?.exe ? ` — ${process.exe}` : "";
            return `<li><i class="fas fa-microchip"></i><span>${escapeHtml(name)} (${escapeHtml(pid)})${escapeHtml(exe)}</span></li>`;
        })
        .join("");
}

function showIntegrityProcessCloseDialog(payload) {
    const modal = document.getElementById("integrity-process-close-modal");
    const messageEl = document.getElementById(
        "integrity-process-close-message",
    );
    const listEl = document.getElementById("integrity-process-close-list");
    const confirmBtn = document.getElementById(
        "integrity-process-close-confirm",
    );
    const skipBtn = document.getElementById("integrity-process-close-skip");
    const fileName = payload?.file || "файл";
    const processes = Array.isArray(payload?.processes)
        ? payload.processes
        : [];
    if (!modal || !messageEl || !listEl || !confirmBtn || !skipBtn) {
        const processList = processes
            .map(
                (process) =>
                    `${process.name || fileName} (PID: ${process.pid})`,
            )
            .join(", ");
        const suffix = processList
            ? `

    Найденные процессы: ${processList}`
            : "";
        return showConfirmDialog({
            title: "Файл запущен",
            message: `Чтобы обновить ${fileName}, нужно закрыть этот процесс.${suffix}

Закрыть процесс и продолжить обновление?`,
            confirmText: "Да, закрыть",
            cancelText: "Нет, пропустить",
            danger: true,
        });
    }

    messageEl.textContent = `Чтобы обновить ${fileName}, нужно закрыть найденный запущенный процесс. Закрыть процесс и продолжить проверку?`;
    listEl.innerHTML = buildIntegrityProcessRows(processes, fileName);

    return new Promise((resolve) => {
        const cleanup = () => {
            confirmBtn.removeEventListener("click", onConfirm);
            skipBtn.removeEventListener("click", onSkip);
            modal.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onKeyDown);
        };
        const close = (result) => {
            cleanup();
            modal.classList.remove("visible");
            setTimeout(() => modal.classList.add("hidden"), 200);
            resolve(result);
        };
        const onConfirm = () => close(true);
        const onSkip = () => close(false);
        const onOverlayClick = (event) => {
            if (event.target === modal) close(false);
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape") close(false);
        };

        confirmBtn.addEventListener("click", onConfirm);
        skipBtn.addEventListener("click", onSkip);
        modal.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);

        modal.classList.remove("hidden");
        requestAnimationFrame(() => modal.classList.add("visible"));
    });
}

async function sendIntegrityProcessCloseAnswer(requestId, shouldClose) {
    try {
        await eel.answer_integrity_process_close(requestId, shouldClose)();
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось отправить решение о закрытии процесса",
            error,
        );
    }
}

async function showIntegrityProcessCloseModal(payload) {
    const requestId = payload?.requestId || "";
    if (!requestId || activeIntegrityProcessCloseRequests.has(requestId))
        return;

    activeIntegrityProcessCloseRequests.add(requestId);
    let shouldClose = false;
    try {
        shouldClose = await showIntegrityProcessCloseDialog(payload);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось показать окно закрытия процесса",
            error,
        );
    } finally {
        await sendIntegrityProcessCloseAnswer(requestId, shouldClose);
        activeIntegrityProcessCloseRequests.delete(requestId);
    }
}
async function pollPendingIntegrityProcessCloseRequest() {
    try {
        const payload =
            await eel.get_pending_integrity_process_close_request()();
        if (payload?.requestId) showIntegrityProcessCloseModal(payload);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось проверить ожидающий запрос закрытия процесса",
            error,
        );
    }
}

function startIntegrityProcessClosePolling() {
    if (integrityProcessClosePollTimer) return;
    pollPendingIntegrityProcessCloseRequest();
    integrityProcessClosePollTimer = setInterval(
        pollPendingIntegrityProcessCloseRequest,
        500,
    );
}

function stopIntegrityProcessClosePolling() {
    if (!integrityProcessClosePollTimer) return;
    clearInterval(integrityProcessClosePollTimer);
    integrityProcessClosePollTimer = null;
}

try {
    eel.expose(showIntegrityProcessCloseModal);
} catch (e) {}

// ---------- Settings: memory + behavior + java args ----------
document.addEventListener("DOMContentLoaded", async function () {
    const memorySlider = document.getElementById("memory-slider");
    const memoryValue = document.getElementById("memory-value");
    const memoryPresets = document.querySelectorAll(".memory-preset");

    let settings = {};
    try {
        settings = (await eel.get_settings()()) || {};
    } catch (e) {
        console.warn("[SLauncher] get_settings недоступно", e);
        settings = {
            memory: 4096,
            checkbox: 0,
            bit_checkbox: 0,
            optimiz_checkbox: 0,
            argument: "",
            open_log_viewer_checkbox: 1,
        };
    }

    memorySlider.value = settings.memory;
    memoryValue.textContent = settings.memory;

    memoryPresets.forEach((preset) => {
        if (preset.dataset.value === String(settings.memory)) {
            preset.classList.add("active");
        } else {
            preset.classList.remove("active");
        }
    });

    async function updateMemoryDisplay(value) {
        memoryValue.textContent = value;
        try {
            await eel.update_setting_memory(value)();
        } catch (e) {
            /* mock or backend missing */
        }
        memoryPresets.forEach((preset) => {
            preset.classList.toggle(
                "active",
                preset.dataset.value === String(value),
            );
        });
    }

    memorySlider.addEventListener("input", function () {
        updateMemoryDisplay(this.value);
    });

    memoryPresets.forEach((preset) => {
        preset.addEventListener("click", function () {
            const value = this.dataset.value;
            memorySlider.value = value;
            updateMemoryDisplay(value);
        });
    });

    // ----- Launcher behavior radios -----
    const radioButtons = document.querySelectorAll(
        'input[name="launcher-behavior"]',
    );
    if (settings.checkbox === 0) {
        document.querySelector(
            'input[name="launcher-behavior"][value="keep-open"]',
        ).checked = true;
    } else if (settings.checkbox === 1) {
        document.querySelector(
            'input[name="launcher-behavior"][value="close"]',
        ).checked = true;
    }

    radioButtons.forEach((button) => {
        button.addEventListener("change", (event) => {
            const checkboxValue = event.target.value === "keep-open" ? 0 : 1;
            try {
                eel.update_setting_checkbox(checkboxValue)();
            } catch (e) {}
        });
    });

    // ----- External log viewer -----
    const openLogViewerToggle = document.getElementById(
        "open-log-viewer-toggle",
    );
    openLogViewerEnabled = settings.open_log_viewer_checkbox !== 0;
    if (openLogViewerToggle) {
        openLogViewerToggle.checked = openLogViewerEnabled;
        openLogViewerToggle.addEventListener("change", function () {
            const value = this.checked ? 1 : 0;
            openLogViewerEnabled = this.checked;
            try {
                eel.update_setting_open_log_viewer_checkbox(value)();
            } catch (e) {}
        });
    }

    // ----- Bit version & optimization -----
    const bitVersionToggle = document.getElementById("bit-version-toggle");
    const optimizToggle = document.getElementById("optimiz-toggle");

    bitVersionToggle.checked = settings.bit_checkbox === 1;
    if (settings.optimiz_checkbox === 1) {
        optimizToggle.checked = true;
        bitVersionToggle.checked = true;
    } else {
        optimizToggle.checked = false;
    }

    bitVersionToggle.addEventListener("change", function () {
        if (this.checked) {
            try {
                eel.update_setting_bit_checkbox(1)();
            } catch (e) {}
        } else {
            if (optimizToggle.checked) {
                bitVersionToggle.checked = true;
            } else {
                try {
                    eel.update_setting_bit_checkbox(0)();
                } catch (e) {}
            }
        }
    });

    optimizToggle.addEventListener("change", function () {
        if (this.checked) {
            bitVersionToggle.checked = true;
            try {
                eel.update_setting_bit_checkbox(1)();
                eel.update_setting_optimiz_checkbox(1)();
            } catch (e) {}
        } else {
            try {
                eel.update_setting_optimiz_checkbox(0)();
            } catch (e) {}
        }
    });

    // ----- Java args -----
    const teneliaArgsToggle = document.getElementById("tenelia-args-toggle");
    const g1gcArgsToggle = document.getElementById("g1gc-args-toggle");
    const customArgsInput = document.getElementById("custom-args-input");
    const checkIntegrityBtn = document.getElementById("check-integrity-btn");
    const integrityInlineLoader = document.getElementById(
        "integrity-inline-loader",
    );
    const integrityProgressMessage = document.getElementById(
        "integrity-progress-message",
    );
    const integrityResultMessage = document.getElementById(
        "integrity-result-message",
    );

    function updateJavaArguments(activeElement) {
        const elements = [teneliaArgsToggle, g1gcArgsToggle, customArgsInput];
        elements.forEach((element) => {
            if (element !== activeElement) {
                if (element.type === "checkbox") element.checked = false;
                else if (element.type === "text") element.value = "";
            }
        });
    }

    if (settings.argument === "Tenelia") {
        teneliaArgsToggle.checked = true;
        updateJavaArguments(teneliaArgsToggle);
    } else if (settings.argument === "G1GC") {
        g1gcArgsToggle.checked = true;
        updateJavaArguments(g1gcArgsToggle);
    } else if (settings.argument) {
        customArgsInput.value = settings.argument;
    }

    teneliaArgsToggle.addEventListener("change", function () {
        if (this.checked) {
            updateJavaArguments(this);
            try {
                eel.update_setting_argument("Tenelia")();
            } catch (e) {}
        } else {
            try {
                eel.update_setting_argument("")();
            } catch (e) {}
        }
    });

    g1gcArgsToggle.addEventListener("change", function () {
        if (this.checked) {
            updateJavaArguments(this);
            try {
                eel.update_setting_argument("G1GC")();
            } catch (e) {}
        } else {
            try {
                eel.update_setting_argument("")();
            } catch (e) {}
        }
    });

    customArgsInput.addEventListener("input", function () {
        if (this.value.trim() !== "") {
            updateJavaArguments(this);
            try {
                eel.update_setting_argument(this.value)();
            } catch (e) {}
        } else {
            try {
                eel.update_setting_argument("")();
            } catch (e) {}
        }
    });

    if (checkIntegrityBtn) {
        checkIntegrityBtn.addEventListener("click", async function () {
            checkIntegrityBtn.disabled = true;
            if (integrityInlineLoader)
                integrityInlineLoader.style.display = "inline-flex";
            if (integrityProgressMessage) {
                integrityProgressMessage.style.display = "block";
                integrityProgressMessage.textContent = "0/0 файлов проверено.";
            }
            if (integrityResultMessage) {
                integrityResultMessage.style.display = "none";
                integrityResultMessage.textContent = "";
            }

            startIntegrityProcessClosePolling();

            try {
                const result = await eel.check_launcher_files_integrity()();
                if (integrityInlineLoader)
                    integrityInlineLoader.style.display = "none";

                if (integrityResultMessage) {
                    integrityResultMessage.style.display = "block";
                    integrityResultMessage.textContent =
                        result?.message || "Проверка завершена.";
                    integrityResultMessage.style.color =
                        result?.status === "ok"
                            ? "var(--success)"
                            : "var(--danger)";
                }

                toast({
                    title:
                        result?.status === "ok"
                            ? "Проверка завершена"
                            : "Проверка с ошибками",
                    message: result?.message || "",
                    type: result?.status === "ok" ? "success" : "error",
                });
            } catch (error) {
                if (integrityInlineLoader)
                    integrityInlineLoader.style.display = "none";
                if (integrityResultMessage) {
                    integrityResultMessage.style.display = "block";
                    integrityResultMessage.style.color = "var(--danger)";
                    integrityResultMessage.textContent =
                        "Не удалось выполнить проверку файлов.";
                }
                toast({
                    title: "Ошибка проверки",
                    message:
                        "Проверьте интернет-соединение и повторите попытку.",
                    type: "error",
                });
            } finally {
                stopIntegrityProcessClosePolling();
                checkIntegrityBtn.disabled = false;
            }
        });
    }
});

// ---------- Version helpers (settings page) ----------
async function updateVersionList() {
    const versionSelect = document.getElementById("version-select-list");
    let installedVersions = [];
    try {
        installedVersions = await eel.get_versions()();
    } catch (e) {}
    const installedVersionsSet = new Set(installedVersions.map((v) => v[1]));

    versionSelect.innerHTML =
        '<option value="">Выберите версию для удаления</option>';
    installedVersionsSet.forEach((version) => {
        const option = document.createElement("option");
        option.value = version;
        option.textContent = version;
        versionSelect.appendChild(option);
    });
}

async function updateVersionFolderList() {
    const versionSelect = document.getElementById("version-select-folder");
    let installedVersions = [];
    try {
        installedVersions = await eel.get_versions()();
    } catch (e) {}
    const installedVersionsSet = new Set(installedVersions.map((v) => v[1]));

    versionSelect.innerHTML = '<option value="">Выберите версию</option>';
    installedVersionsSet.forEach((version) => {
        const option = document.createElement("option");
        option.value = version;
        option.textContent = version;
        versionSelect.appendChild(option);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    const deleteButton = document.getElementById("delete-version-btn");
    const versionSelectEl = document.getElementById("version-select-list");
    const message = document.getElementById("delete-message");

    deleteButton.addEventListener("click", async function () {
        const selectedVersion = versionSelectEl.value;

        if (selectedVersion) {
            let success = false;
            try {
                success = await eel.delete_versions_list(selectedVersion)();
            } catch (e) {}

            if (success) {
                message.textContent = `Версия ${selectedVersion} удалена.`;
                message.style.color = "var(--success)";
                message.style.display = "block";
                toast({
                    title: "Версия удалена",
                    message: selectedVersion,
                    type: "success",
                });

                await updateVersionGrid();
                await updateVersionSelect();
            } else {
                message.textContent = "Произошла ошибка при удалении версии.";
                message.style.color = "var(--danger)";
                message.style.display = "block";
                toast({ title: "Ошибка удаления", type: "error" });
            }

            versionSelectEl.value = "";
            setTimeout(() => {
                message.style.display = "none";
            }, 3500);
        } else {
            message.textContent = "Выберите версию для удаления.";
            message.style.color = "var(--text-muted)";
            message.style.display = "block";
        }
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const selectFolderButton = document.getElementById("select-folder-btn");
    const versionSelectEl = document.getElementById("version-select-folder");
    const folderMessage = document.getElementById("folder-message");

    selectFolderButton.addEventListener("click", async function () {
        const selectedVersion = versionSelectEl.value;

        if (selectedVersion) {
            try {
                await eel.open_folder_version(selectedVersion)();
                toast({
                    title: "Папка открыта",
                    message: selectedVersion,
                    type: "info",
                });
            } catch (e) {}
        } else {
            folderMessage.textContent = "Выберите версию.";
            folderMessage.style.color = "var(--text-muted)";
            folderMessage.style.display = "block";
            setTimeout(() => {
                folderMessage.style.display = "none";
            }, 2500);
        }
    });
});

// ---------- Bottom panel: version / play ----------
const versionSelect = document.querySelector(".version-select");
const accountSelect = document.querySelector(".account-select");
const serverSelect = document.querySelector(".server-select");
const playBtn = document.querySelector(".play-btn");
let downloadButtons = document.querySelectorAll(".download-btn");
let isDownloading = false;
let activeDownloadTask = null;
const downloadQueue = [];
const queuedDownloadKeys = new Set();
let logPollTimer = null;
let logPosition = 0;
let externalLogsOpened = false;
let openLogViewerEnabled = true;
let launcherAccounts = [];
let launcherVersions = [];
let launcherUpdateCheckRunning = false;
const skinFaceCache = new Map();
const DEFAULT_STEVE_FACE = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAAHbklEQVR4nO2c+XMURRTH8ycoqCGwAUJIoiD3kaAiCggJMZs75FJgE/BCuc+gEG5CuELAEESuKin8RVBUIBBu8MADPKqACEQof7IstUrLzA95Vs/s7MzszGx3Z7pnd0m/qs+vU7Wf7+vX+0u/mBhRokSJEiVKlChRokSJEiVKlChRokLU1bXe1OMzR98/VNi//WB2CvDkgFcl2cB+RFYwSbAP8aKZvYjMvibeR0zSkyizB5Fh5D2V9D4B9nmT24/OSPvt8vKsdNfkHyoa0M5NbJZZ6n4bqbRi91CIRexWmagnARpVJmjsy0ppP1/tTeUeAOp8vNhk52Izk6ylchGbYCsWsUumN+x6wUiDyniFIxWp97gH8EFBv3ac2NBjwEbsJBuxGXZi+3AR22AhtmF8L3hXzziNnQF6wu70xHbuATgTm4gXm04mttFG7C6mYnsqjNXYoed5RLxMvR/uAbASSzNfG6nE9mImtj6Y5xS2B/AojFGoG+PhHwDLi6uRZL46ELuDoVgDz/aQ2RbM6B78A2B9cTUEi7WZr87FehyJRWyV6a7xTHfYEgT3AFhfXDvHhhIbz13sVkKxMk/HwWYrnoqDTTLd+AfgWKzFxVWvk2onts5G7DbHYuOIxBoY1Q1qTcRCbVos/wA6KpZ4vo4Jn9haG7Eb00JTk6ryGP8AOn5xeejm62h6sZs4irVjw0gj3ANgcXHZid3sglhNaiyxVDOPwvoR1nAPgOYfAdnFFUcgNjbsYvWsGx7MIwG4B0Dzj4Do4hoVHWJV1g4LDfcASMXymK8bwigWsWZoVyzcA8CJlS4tA+lSFWeWcmSJxkUzq4d01dHFwKrBXfgHgOvYaJQqUYAkW7FyEOJh/gHgxkA0SpVMLLYFSdZTPdAI9wBw8zVypS4JKZYURfRDMisGmOEeAO7iikapki2LTFhJdzUA3D+CaJQq4bigEfYAkGTjPwHjP4KokXrRKNaehQbCHoDdvwCVaJQqURD2ACJX6iJHYvEsICIMATz4UiUKXAig80mVAswH6Xxo+AfQCaVKFLgQQOeTKpmYZ0uYA+ApdUHYpNLgQgDR1K3zODLXkggJ4MGSKtlxzgz/ACiF4ap8+s9QVvkTlFX+KFNa8QOUVlyHUt91KPFdcywV931cWUk2MsdABAWgCMBVie8alEz7HoplvoPiqd/CZJlvoGjKVcedivs+PoA5VLgQAF0H4qpoylUomvI1FL6M+AoKX/oSCmS+gILyK1TH3wrc99kEMDtA1AWQX34F8ssvQ37ZZcgruwR5pYiLkFt6AXJLLlAdfytw38cHMJsKlwIgHwG4yi05DzmI4nOQXXwWsicjzoB3cjN4i5qpR0AwuO8zC+AsYpYbAZAffwSuvEWnIQtReAqyCpvgRUTBScgsOAGZ+Seojr8VuO9jAzg7iwr+AVAcfwSuMvOPy0zK+1wmI+8zyMj9VCY95xj1CAgG9/0oDIBuBOAqPecYpOd8AhOzP/ZzFCZ4jwSgOf5W4L5PFsBbxIQhAGcdKmGk3q9P09ieqlE3UubeNsQIha2I4QpbEMNCdCu51AgLwLlUGu75RSJ+3YwYqrAJMUShFjEYWjeqDILWGgW2gt/E4n4AHZBKQ6tfZGvNQGjdoDIA7q5XeRLurvOztn+AO2v6ybCQKp0hh38ATMSSd90dv0iZ1U9orHo8wO2VKRrVyQorEEnMxGrMDEmYA2A/U2/7RSJ+WY7oq/AOIlHhbUQfmZZliASFqgQmUmlwIQB3Z2pLlSKypao3tCxV6QW3lqj0hFuLVeLh1iIVD9xc6GEqV+MNWyIgAIKZSnH8by70aCzooTG/e4Ab8+I05nYzwEosKS4E4O5MvREklBYWUg0063ndBP8AGM/Ug5i1Nk471WqljX7VAolUGlwIgO08PRByCVOS407F7atwKlxqfs1AhAWAF7XXYuGSqUMJj78V+jUKgYUfulf+JFJpcCEAtjN1j02H7mbUoVav+vWv+Z3INvKqTOQEQNipjSEWfKDdE7QjIBjT6/2gdQgkUm05bYZ/AAwuKssOHWe9dsZpZ9quP/C/dSaRSs4rbgTA5rLSd2h9UIfq1x/QHH8rcI/GSaTS4HIAzmdnnd1yDrsOpexU88v7oGe1lIIjIADnF5V1h8aF2BMR6mF4xx6Dq688yeXOICIMAdBfVHpqGQuleUkvv+okFIvllIILATi9qIxztYZqRQHNSgKyVQQkUjWmY+EfAKPLSmU9Y6G4nQ7BjwtJpNLgQgCsLiyly1jKDN7bgFsrgOiY6EpbwhwA/excw1gobpVA8Et3Eqk0uBCA84tKzyrGQmnpuOwKS9wPwEIqzXGuZijTeQDWUqUmcvgHwPjSkhgef5pOpRVrj89ABAXw4EiVKHAhgM4nVYruAKJfqhRJAbQ1Vf7d2aRKhLQ1TfuTewDSyYqPOpNUiY7D3AP477Qvpa3J90cE/FiIJNpO+n7/50ylJ8aN+vf41HipadqHbU2+v8L9w6Vwi1ccHHZNvihRokSJEiVKlChRokSJEiVKlKiYaK3/Aa+vZ4Ppmm36AAAAAElFTkSuQmCC`;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function accountName(account) {
    return account?.login || account?.[1] || "";
}

function accountType(account) {
    return account?.account_type || account?.[3] || "offline";
}

function accountSkinUrl(account) {
    const name = accountName(account);
    const storedUrl = account?.skin_url || account?.[7] || "";
    if (storedUrl) {
        return storedUrl.replace(
            "https://skinsystem.ely.by",
            "http://skinsystem.ely.by",
        );
    }
    return accountType(account) === "ely"
        ? `http://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`
        : "";
}

function makeAvatar(account, className = "") {
    const avatar = document.createElement("span");
    const type = accountType(account);
    const name = accountName(account);
    avatar.className =
        `${className} ${type === "ely" ? "ely" : "offline"}`.trim();

    const img = document.createElement("img");
    img.alt = name || "Steve";
    img.src = DEFAULT_STEVE_FACE;
    avatar.appendChild(img);
    if (type !== "ely" || !name) return avatar;

    const cachedFace = skinFaceCache.get(name);
    if (cachedFace) {
        img.src = cachedFace;
        return avatar;
    }

    eel.get_ely_skin_face(name)()
        .then((result) => {
            if (!result?.ok || !result.face)
                throw new Error(result?.error || "skin_face_error");
            skinFaceCache.set(name, result.face);
            img.src = result.face;
        })
        .catch(() => {
            avatar.classList.remove("ely");
            avatar.classList.add("offline");
            img.src = DEFAULT_STEVE_FACE;
        });
    return avatar;
}

function closeLauncherCombos(except = null) {
    document.querySelectorAll(".launcher-combo.open").forEach((combo) => {
        if (combo !== except) combo.classList.remove("open");
    });
}

function updateComboToggle(kind, label, account = null) {
    const combo = document.querySelector(`.${kind}-combo`);
    if (!combo) return;
    const title = combo.querySelector(".combo-title");
    if (title) title.textContent = label;
    if (kind === "account") {
        const avatar = combo.querySelector(".combo-account-avatar");
        if (avatar) {
            avatar.replaceWith(
                makeAvatar(
                    account || { login: "", account_type: "offline" },
                    "combo-avatar combo-account-avatar",
                ),
            );
        }
    }
}

function setupLauncherCombos() {
    document.querySelectorAll(".launcher-combo-toggle").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const combo = button.closest(".launcher-combo");
            const willOpen = !combo.classList.contains("open");
            closeLauncherCombos(combo);
            combo.classList.toggle("open", willOpen);
        });
    });
    document.addEventListener("click", () => closeLauncherCombos());
    document.querySelectorAll(".combo-add-account").forEach((button) => {
        button.addEventListener("click", () => {
            closeLauncherCombos();
            const menuItem = document.querySelector(
                '.menu-item[data-section="accounts"]',
            );
            if (menuItem) menuItem.click();
        });
    });
}

function renderAccountCombo() {
    const box = document.querySelector(".account-combo-options");
    if (!box) return;
    box.innerHTML = "";
    const selected = accountSelect?.value || "";
    const selectedAccount = launcherAccounts.find(
        (account) => accountName(account) === selected,
    );
    updateComboToggle(
        "account",
        selected || "Выберите аккаунт",
        selectedAccount,
    );

    if (launcherAccounts.length === 0) {
        box.innerHTML =
            '<div class="empty-state"><i class="fas fa-user-slash"></i><div>Аккаунтов нет</div></div>';
        return;
    }

    launcherAccounts.forEach((account) => {
        const name = accountName(account);
        const type = accountType(account);
        const option = document.createElement("button");
        option.type = "button";
        option.className = `combo-option ${name === selected ? "selected" : ""}`;
        option.appendChild(makeAvatar(account, "combo-avatar"));
        const main = document.createElement("span");
        main.className = "combo-option-main";
        main.innerHTML = `<span class="combo-option-name">${escapeHtml(name)}</span><span class="combo-option-subtitle">${type === "ely" ? "Ely.by" : "Offline"}</span>`;
        const more = document.createElement("span");
        more.className = "combo-option-more";
        // more.innerHTML = '<i class="fas fa-ellipsis"></i>';
        option.appendChild(main);
        option.appendChild(more);
        option.addEventListener("click", () => {
            accountSelect.value = name;
            accountSelect.dispatchEvent(new Event("change"));
            closeLauncherCombos();
            renderAccountCombo();
        });
        box.appendChild(option);
    });
}

function renderVersionCombo() {
    const box = document.querySelector(".version-combo-options");
    if (!box) return;
    box.innerHTML = "";
    const selected = versionSelect?.value || "";
    updateComboToggle(
        "version",
        selected ? `Версия ${selected}` : "Выберите версию",
    );

    if (launcherVersions.length === 0) {
        box.innerHTML =
            '<div class="empty-state"><i class="fas fa-cubes"></i><div>Версий нет</div></div>';
        return;
    }

    launcherVersions.forEach((version) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = `combo-option ${version === selected ? "selected" : ""}`;
        const icon = document.createElement("span");
        icon.className = "combo-version-icon";
        icon.innerHTML = '<i class="fas fa-cubes"></i>';
        const main = document.createElement("span");
        main.className = "combo-option-main";
        main.innerHTML = `<span class="combo-option-name">Версия ${escapeHtml(version)}</span><span class="combo-option-subtitle">Установлена в лаунчере</span>`;
        option.appendChild(icon);
        option.appendChild(main);
        option.addEventListener("click", () => {
            versionSelect.value = version;
            versionSelect.dispatchEvent(new Event("change"));
            if (typeof toggleServerSelect === "function") toggleServerSelect();
            closeLauncherCombos();
            renderVersionCombo();
        });
        box.appendChild(option);
    });
}

function renderServerCombo() {
    const box = document.querySelector(".server-combo-options");
    if (!box) return;
    box.innerHTML = "";
    const selected = serverSelect?.value || "";
    updateComboToggle("server", selected || "Выберите сервер");

    const servers = Array.from(serverSelect?.options || [])
        .filter((option) => option.value)
        .map((option) => ({
            value: option.value,
            label: option.textContent || option.value,
        }));

    if (servers.length === 0) {
        box.innerHTML =
            '<div class="empty-state"><i class="fas fa-server"></i><div>Серверов нет</div></div>';
        return;
    }

    servers.forEach((server) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = `combo-option ${server.value === selected ? "selected" : ""}`;
        const icon = document.createElement("span");
        icon.className = "combo-server-icon";
        icon.innerHTML = '<i class="fas fa-server"></i>';
        const main = document.createElement("span");
        main.className = "combo-option-main";
        main.innerHTML = `<span class="combo-option-name">${escapeHtml(server.label)}</span><span class="combo-option-subtitle">Игровой сервер</span>`;
        option.appendChild(icon);
        option.appendChild(main);
        option.addEventListener("click", () => {
            serverSelect.value = server.value;
            serverSelect.dispatchEvent(new Event("change"));
            closeLauncherCombos();
            renderServerCombo();
        });
        box.appendChild(option);
    });
}

document.addEventListener("DOMContentLoaded", setupLauncherCombos);

function showRuntimeLogsModal() {
    const modal = document.getElementById("runtimeLogModal");
    if (!modal) return;
    modal.style.display = "flex";
}

function hideRuntimeLogsModal() {
    const modal = document.getElementById("runtimeLogModal");
    if (!modal) return;
    modal.style.display = "none";
    if (logPollTimer) {
        clearInterval(logPollTimer);
        logPollTimer = null;
    }
}

async function pollLauncherLogs() {
    try {
        const response = await eel.read_launcher_logs(logPosition, 32768)();
        if (!response) return;
        const output = document.getElementById("runtimeLogContent");
        if (!output) return;
        if (response.text) {
            output.textContent += response.text;
            output.scrollTop = output.scrollHeight;
        }
        logPosition = response.position || logPosition;
    } catch (error) {
        /* ignore */
    }
}

function startLauncherLogsStreaming(reset = false) {
    if (openLogViewerEnabled && !externalLogsOpened) {
        try {
            eel.open_external_log_viewer()();
        } catch (e) {}
        externalLogsOpened = true;
    }
    showRuntimeLogsModal();
    const output = document.getElementById("runtimeLogContent");
    if (!output) return;
    if (reset) {
        output.textContent = "";
        logPosition = 0;
    }
    if (logPollTimer) clearInterval(logPollTimer);
    pollLauncherLogs();
    logPollTimer = setInterval(pollLauncherLogs, 800);
}

function toggleDownloadButtons(disable) {
    downloadButtons = document.querySelectorAll(".download-btn");
    downloadButtons.forEach((btn) => {
        if (btn.classList.contains("installed")) return;
        btn.disabled = disable;
    });
}

function getDownloadTaskKey(version, isBuild) {
    return `${isBuild ? "build" : "vanilla"}:${version}`;
}

function setDownloadButtonLabel(btn, html, disabled) {
    if (!btn) return;
    btn.innerHTML = html;
    btn.disabled = disabled;
}

function dequeueByKey(taskKey) {
    const index = downloadQueue.findIndex((task) => task.key === taskKey);
    if (index === -1) return null;
    const [task] = downloadQueue.splice(index, 1);
    queuedDownloadKeys.delete(taskKey);
    return task;
}

async function runNextDownloadTask() {
    if (isDownloading || downloadQueue.length === 0) return;
    const nextTask = downloadQueue.shift();
    if (!nextTask) return;
    queuedDownloadKeys.delete(nextTask.key);
    await executeDownloadTask(nextTask);
}

async function executeDownloadTask(task) {
    if (!task?.run) return;
    isDownloading = true;
    activeDownloadTask = task;
    task.cancelRequested = false;
    try {
        await task.run(task);
    } finally {
        activeDownloadTask = null;
        isDownloading = false;
        await runNextDownloadTask();
    }
}

function enqueueDownloadTask(task) {
    if (!task) return;

    if (activeDownloadTask && activeDownloadTask.key === task.key) {
        activeDownloadTask.cancelRequested = true;
        toast({
            title: "Отмена загрузки",
            message: `${task.version} будет удалена после завершения текущего шага`,
            type: "info",
        });
        return;
    }

    if (queuedDownloadKeys.has(task.key)) {
        dequeueByKey(task.key);
        setDownloadButtonLabel(
            task.button,
            '<i class="fas fa-download"></i> Скачать',
            false,
        );
        toast({
            title: "Удалено из очереди",
            message: task.version,
            type: "info",
        });
        return;
    }

    if (isDownloading) {
        downloadQueue.push(task);
        queuedDownloadKeys.add(task.key);
        setDownloadButtonLabel(
            task.button,
            '<i class="fas fa-clock"></i> В очереди',
            false,
        );
        toast({
            title: "Добавлено в очередь",
            message: task.version,
            type: "info",
        });
        return;
    }

    executeDownloadTask(task);
}

async function cleanupCancelledInstall(version, installedVersionsSet, btn) {
    try {
        await eel.delete_versions_list(version)();
    } catch (e) {}
    try {
        await eel.delete_version_record(version)();
    } catch (e) {}
    if (installedVersionsSet) {
        installedVersionsSet.delete(version);
    }
    if (btn) {
        btn.classList.remove("installed");
        setDownloadButtonLabel(
            btn,
            '<i class="fas fa-download"></i> Скачать',
            false,
        );
        const cover = btn
            .closest(".version-card")
            ?.querySelector(".version-card-cover");
        const badge = cover?.querySelector(".version-installed-badge");
        if (badge) badge.remove();
    }
}

// ---------- Alerts ----------
function showAlert() {
    document.getElementById("customAlert").style.display = "flex";
}
function showAlertVersion() {
    document.getElementById("customAlertVersions").style.display = "flex";
}
function showAlertGame() {
    document.getElementById("customAlertGame").style.display = "flex";
}
function showAlertServer() {
    document.getElementById("customAlertServer").style.display = "flex";
}
function closeAlert() {
    document.getElementById("customAlert").style.display = "none";
}
function closeAlertVersion() {
    document.getElementById("customAlertVersions").style.display = "none";
}
function closeAlertGame() {
    document.getElementById("customAlertGame").style.display = "none";
}
function closeAlertServer() {
    document.getElementById("customAlertServer").style.display = "none";
}
window.closeAlert = closeAlert;
window.closeAlertVersion = closeAlertVersion;
window.closeAlertGame = closeAlertGame;
window.closeAlertServer = closeAlertServer;

function isValidLogin(login) {
    return /^[A-Za-z0-9_]{3,16}$/.test(login);
}

function isValidServerAddress(value) {
    return /^(([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?$/.test(
        value,
    );
}

const SERVER_STATUS_CACHE_TTL_MS = 30_000;
const serverStatusCache = new Map();

function normalizeServerIp(ip) {
    return String(ip || "")
        .trim()
        .toLowerCase();
}

async function getServerInfoCached(ip, forceRefresh = false) {
    const key = normalizeServerIp(ip);
    if (!key) return null;

    const now = Date.now();
    const cached = serverStatusCache.get(key);
    if (
        !forceRefresh &&
        cached &&
        now - cached.ts < SERVER_STATUS_CACHE_TTL_MS
    ) {
        return cached.data;
    }

    const serverData = await eel.check_server_info(key)();
    if (serverData) {
        serverStatusCache.set(key, { ts: now, data: serverData });
    }
    return serverData;
}

// ---------- Server card ----------
function createServerCard(serverData, onDelete) {
    const serverCard = document.createElement("div");
    serverCard.classList.add("server-card");
    serverCard.dataset.ip = normalizeServerIp(serverData.ip);

    let image = null;
    if (
        typeof serverData.icon === "string" &&
        serverData.icon.startsWith("https://")
    ) {
        image = document.createElement("img");
        image.className = "server-card-image";
        image.alt = serverData.name || "Minecraft server";
        image.src = serverData.icon;
        image.onerror = () => {
            const placeholder = document.createElement("div");
            placeholder.className = "server-card-image";
            placeholder.style.display = "flex";
            placeholder.style.alignItems = "center";
            placeholder.style.justifyContent = "center";
            placeholder.innerHTML =
                '<i class="fas fa-server" style="font-size:32px;color:var(--text-dim)"></i>';
            image.replaceWith(placeholder);
        };
    } else {
        image = document.createElement("div");
        image.className = "server-card-image";
        image.style.display = "flex";
        image.style.alignItems = "center";
        image.style.justifyContent = "center";
        image.innerHTML =
            '<i class="fas fa-server" style="font-size:32px;color:var(--text-dim)"></i>';
    }

    const serverInfo = document.createElement("div");
    serverInfo.className = "server-info";

    const title = document.createElement("div");
    title.className = "server-title";
    title.textContent = serverData.name || "Сервер Minecraft";

    const statusRow = document.createElement("div");
    statusRow.className = "server-status";

    const playerCount = document.createElement("div");
    playerCount.className = "player-count";
    playerCount.innerHTML = `<i class="fas fa-user-group"></i> ${serverData.players_online ?? 0} игроков`;

    const status = document.createElement("div");
    const statusText = String(serverData.status || "Online");
    status.className = `status ${statusText.toLowerCase()}`;
    status.textContent = statusText;

    statusRow.appendChild(playerCount);
    statusRow.appendChild(status);

    const ipNode = document.createElement("div");
    ipNode.className = "ip-address";
    const ipText = document.createElement("span");
    ipText.textContent = serverData.ip;
    const copyBtn = document.createElement("button");
    copyBtn.className = "ip-copy-btn";
    copyBtn.title = "Скопировать IP";
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
            navigator.clipboard.writeText(serverData.ip);
            toast({
                title: "IP скопирован",
                message: serverData.ip,
                type: "success",
            });
        } catch {}
    });
    ipNode.appendChild(ipText);
    ipNode.appendChild(copyBtn);

    serverInfo.appendChild(title);
    serverInfo.appendChild(statusRow);
    serverInfo.appendChild(ipNode);

    const footer = document.createElement("div");
    footer.className = "server-card-footer";
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-server-btn";
    deleteButton.innerHTML = '<i class="fas fa-trash"></i> Удалить';
    deleteButton.addEventListener("click", onDelete);
    footer.appendChild(deleteButton);

    serverCard.appendChild(image);
    serverCard.appendChild(serverInfo);
    serverCard.appendChild(footer);
    return serverCard;
}

// ---------- Bottom version select ----------
async function updateVersionSelect() {
    while (versionSelect.options.length > 1) {
        versionSelect.remove(1);
    }

    let versionsFromDb = [];
    let accountVersionData = [];
    try {
        versionsFromDb = await eel.get_versions()();
        accountVersionData = await eel.get_account_version()();
    } catch (e) {}

    let logindata = "";
    let versiondata = "";
    if (accountVersionData.length > 0) {
        [logindata, versiondata] = accountVersionData;
    }

    const uniqueVersions = Array.from(
        new Set((versionsFromDb || []).map((version) => version[1])),
    );
    launcherVersions = uniqueVersions;
    uniqueVersions.forEach((versionValue) => {
        const option = new Option(`${versionValue}`, versionValue);
        versionSelect.add(option);
    });

    // Восстанавливаем сохранённый выбор версии из БД.
    if (versiondata && uniqueVersions.includes(versiondata)) {
        versionSelect.value = versiondata;
    }
    // Видимость селекта сервера зависит только от выбранной версии.
    toggleServerSelect();

    playBtn.disabled = !versionSelect.value || isDownloading;
    renderVersionCombo();
    updateStats();
}

versionSelect.addEventListener("change", () => {
    playBtn.disabled = !versionSelect.value || isDownloading;
    renderVersionCombo();
    if (typeof toggleServerSelect === "function") toggleServerSelect();
});

accountSelect.addEventListener("change", () => {
    renderAccountCombo();
});

serverSelect.addEventListener("change", () => {
    renderServerCombo();
});

// ---------- Circular progress ----------
const circularProgress = document.querySelector(".circular-progress");
const progressCircle = document.querySelector(".circular-progress .progress");
const progressText = document.querySelector(".progress-text");

// Доп. подписчик на прогресс установки ядра (используется импортом сборки),
// чтобы показывать тот же реальный прогресс на полоске загрузки сборки.
window.__coreDownloadProgress = null;

function updateProgressDownload(percent) {
    const validPercent = Math.max(0, Math.min(percent, 100));
    // r=27 → 2π*27 ≈ 169.646
    const dashoffset = 169.646 - (169.646 * validPercent) / 100;
    progressCircle.style.strokeDashoffset = dashoffset;
    progressText.textContent = `${Math.round(validPercent)}%`;
    if (typeof window.__coreDownloadProgress === "function") {
        window.__coreDownloadProgress(validPercent);
    }
}

try {
    eel.expose(updateProgressDownload);
} catch (e) {}

// ---------- Progress callbacks for content/share/import (exposed to Python) ----------
// Каждый колбэк просто перенаправляет прогресс в активный обработчик, если он есть.
window.__contentInstallProgress = null;
window.__shareProgress = null;
window.__importProgress = null;
window.__themeShareProgress = null;
window.__themeImportProgress = null;

function updateContentInstallProgress(percent, label) {
    if (typeof window.__contentInstallProgress === "function") {
        window.__contentInstallProgress(percent, label);
    }
}
function updateShareProgress(percent, stage, log) {
    if (typeof window.__shareProgress === "function") {
        window.__shareProgress(percent, stage, log);
    }
}
function updateImportProgress(percent, stage, log) {
    if (typeof window.__importProgress === "function") {
        window.__importProgress(percent, stage, log);
    }
}
function updateThemeShareProgress(percent, stage, log) {
    if (typeof window.__themeShareProgress === "function") {
        window.__themeShareProgress(percent, stage, log);
    }
}
function updateThemeImportProgress(percent, stage, log) {
    if (typeof window.__themeImportProgress === "function") {
        window.__themeImportProgress(percent, stage, log);
    }
}
try {
    eel.expose(updateContentInstallProgress);
    eel.expose(updateShareProgress);
    eel.expose(updateImportProgress);
    eel.expose(updateThemeShareProgress);
    eel.expose(updateThemeImportProgress);
} catch (e) {}

// ---------- Play button ----------
playBtn.addEventListener("click", async () => {
    const selectedVersion = versionSelect.value;
    const selectedLogin = accountSelect.value;
    const selectedServer = serverSelect.value;
    let launcherCheckClose = true;

    if (!selectedVersion || !selectedLogin || isDownloading) {
        showAlert();
        return;
    }

    if (selectedVersion === "LunarПВП 1.8.9" && !selectedServer) {
        showAlert();
        return;
    }

    try {
        isDownloading = true;
        startLauncherLogsStreaming(false);
        circularProgress.classList.add("active");
        toggleDownloadButtons(true);
        playBtn.disabled = true;
        playBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Загрузка...';

        await eel.update_account_version(selectedLogin, selectedVersion)();
        await eel.start_game(selectedLogin, selectedVersion, selectedServer)();
        toast({
            title: "Игра запущена",
            message: selectedVersion,
            type: "success",
        });
    } catch (e) {
        showAlertGame();
        launcherCheckClose = false;
    } finally {
        isDownloading = false;
        circularProgress.classList.remove("active");
        toggleDownloadButtons(false);
        playBtn.innerHTML = '<i class="fas fa-play"></i> Играть';
        playBtn.disabled = false;

        if (launcherCheckClose) {
            renderAccountCombo();
            renderVersionCombo();
            try {
                const canClose = await eel.check_close()();
                if (canClose) window.close();
            } catch (e) {}
        }
    }
});

// ---------- WebSocket reconnect ----------
async function checkWebSocketConnection() {
    if (eel._websocket && eel._websocket.readyState === WebSocket.OPEN) return;
    if (eel._websocket && eel._websocket.readyState === WebSocket.CONNECTING) {
        setTimeout(checkWebSocketConnection, 1000);
    } else {
        await reconnectEelPlay();
    }
}

async function reconnectEelPlay() {
    try {
        if (eel._websocket && eel._websocket.readyState === WebSocket.CLOSED) {
            eel._websocket = new WebSocket(
                `http://${window.location.host}/main.html`,
            );
        } else if (
            eel._websocket &&
            eel._websocket.readyState === WebSocket.CONNECTING
        ) {
            setTimeout(reconnectEelPlay, 1000);
        }
    } catch (error) {
        setTimeout(reconnectEelPlay, 1000);
    }
}

// ---------- Servers ----------
document
    .getElementById("add-server-btn")
    .addEventListener("click", async function () {
        const ipInput = document.getElementById("server-ip");
        const ip = ipInput.value.trim();

        if (ip && isValidServerAddress(ip)) {
            try {
                const serverData = await getServerInfoCached(ip, true);
                if (serverData) {
                    const serverList = document.getElementById("server-list");
                    const normalizedIp = normalizeServerIp(serverData.ip);
                    const existsCard = serverList.querySelector(
                        `.server-card[data-ip="${normalizedIp}"]`,
                    );
                    if (existsCard) {
                        toast({
                            title: "Сервер уже добавлен",
                            message: serverData.ip,
                            type: "info",
                        });
                        ipInput.value = "";
                        await updateServerSelect();
                        return;
                    }
                    const serverCard = createServerCard(
                        serverData,
                        async function () {
                            try {
                                await eel.delete_server_by_ip(serverData.ip)();
                                serverStatusCache.delete(
                                    normalizeServerIp(serverData.ip),
                                );
                                serverList.removeChild(serverCard);
                                await updateServerSelect();
                                updateStats();
                                toast({ title: "Сервер удалён", type: "info" });
                            } catch (error) {}
                        },
                    );
                    serverList.appendChild(serverCard);
                    ipInput.value = "";
                    await updateServerSelect();
                    updateStats();
                    toast({
                        title: "Сервер добавлен",
                        message: serverData.name || ip,
                        type: "success",
                    });
                } else {
                    showAlertServer();
                }
            } catch (error) {
                showAlertServer();
            }
        } else {
            showAlertServer();
        }
    });

async function getIpAddress() {
    try {
        const serverIpsRaw = await eel.get_ip_address()();
        const serverIps = Array.from(
            new Set((serverIpsRaw || []).map((ip) => normalizeServerIp(ip))),
        ).filter(Boolean);
        const serverList = document.getElementById("server-list");
        serverList.innerHTML = "";

        const serverListData = await Promise.all(
            serverIps.map((ip) => getServerInfoCached(ip)),
        );
        for (const serverData of serverListData) {
            if (serverData) {
                const serverCard = createServerCard(
                    serverData,
                    async function () {
                        try {
                            await eel.delete_server_by_ip(serverData.ip)();
                            serverStatusCache.delete(
                                normalizeServerIp(serverData.ip),
                            );
                            serverList.removeChild(serverCard);
                            await updateServerSelect();
                            updateStats();
                        } catch (error) {}
                    },
                );
                serverList.appendChild(serverCard);
            }
        }
        await updateServerSelect();

        if (serverIps.length === 0) {
            serverList.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <i class="fas fa-server"></i>
                    <div>Серверов пока нет</div>
                    <div style="font-size:11px;color:var(--text-dim)">Добавьте первый сервер выше</div>
                </div>
            `;
        }
    } catch (error) {
        /* ignore */
    }
}

// Единственный источник правды для видимости селекта сервера.
// Сервер показываем ТОЛЬКО когда выбрана версия LunarПВП 1.8.9.
function toggleServerSelect() {
    const vs = document.querySelector(".version-select");
    const ss = document.querySelector(".server-select");
    const combo = document.querySelector(".server-combo");
    if (!vs || !ss) return;
    const selected = vs.value || "";
    const shouldShow = selected === "LunarПВП 1.8.9";
    if (combo) {
        combo.style.display = shouldShow ? "" : "none";
        if (!shouldShow) combo.classList.remove("open");
    }
    ss.style.display = shouldShow ? "block" : "none";
    renderServerCombo();
}

async function updateServerSelect() {
    const ss = document.querySelector(".server-select");
    while (ss.options.length > 1) ss.remove(1);

    let serverIps = [];
    try {
        serverIps = await eel.get_ip_address()();
    } catch (e) {}
    const uniqueIps = Array.from(
        new Set((serverIps || []).map((ip) => normalizeServerIp(ip))),
    ).filter(Boolean);

    // Только наполняем список адресов — видимость зависит исключительно от версии.
    uniqueIps.forEach((ip) => ss.add(new Option(ip, ip)));
    toggleServerSelect();
}

// ---------- Accounts ----------
document.addEventListener("DOMContentLoaded", () => {
    const accountInput = document.getElementById("login");
    const addAccountBtn = document.querySelector(".add-account-btn");
    const addElyAccountBtn = document.querySelector(".add-ely-account-btn");
    const elyLoginInput = document.getElementById("ely-login");
    const elyPasswordInput = document.getElementById("ely-password");
    const accountItems = document.querySelector(".account-items");

    async function updateAccountSelect() {
        accountSelect.innerHTML = '<option value="">Выберите аккаунт</option>';
        accountItems.innerHTML = "";

        let accounts = [];
        let accountVersionData = [];
        try {
            accounts = await eel.get_accounts()();
            accountVersionData = await eel.get_account_version()();
        } catch (e) {}

        launcherAccounts = accounts || [];
        let logindata1 = "";
        if (accountVersionData.length > 0) {
            [logindata1] = accountVersionData;
        }

        const countEl = document.getElementById("accounts-count");
        if (countEl) countEl.textContent = launcherAccounts.length;

        if (launcherAccounts.length === 0) {
            accountItems.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <div>Аккаунтов нет</div>
                    <div style="font-size:11px;color:var(--text-dim)">Добавьте offline или Ely.by аккаунт</div>
                </div>
            `;
            renderAccountCombo();
            updateStats();
            return;
        }

        launcherAccounts.forEach((account) => {
            const name = accountName(account);
            const type = accountType(account);
            const option = new Option(name, name);
            accountSelect.add(option);
            if (name == logindata1) accountSelect.value = logindata1;

            const accountItem = document.createElement("div");
            accountItem.className = `account-item ${name === logindata1 ? "selected" : ""}`;

            const avatar = makeAvatar(account, "account-avatar");
            const meta = document.createElement("div");
            meta.className = "account-meta";
            const nameRow = document.createElement("div");
            nameRow.className = "account-name-row";

            const nameNode = document.createElement("span");
            nameNode.className = "account-name";
            nameNode.textContent = name;
            const badge = document.createElement("span");
            badge.className = `account-badge ${type === "ely" ? "ely" : "offline"}`;
            badge.innerHTML =
                type === "ely"
                    ? '<i class="fas fa-shield-halved"></i> Ely.by'
                    : '<i class="fas fa-user"></i> Offline';
            nameRow.appendChild(nameNode);
            nameRow.appendChild(badge);
            const subtitle = document.createElement("div");
            subtitle.className = "account-subtitle";
            subtitle.textContent =
                type === "ely"
                    ? "Скин загружается из Ely.by"
                    : "Обычный аккаунт со Steve-иконкой";
            meta.appendChild(nameRow);
            meta.appendChild(subtitle);

            accountItem.addEventListener("click", () => {
                accountSelect.value = name;
                accountSelect.dispatchEvent(new Event("change"));
                document
                    .querySelectorAll(".account-item.selected")
                    .forEach((item) => item.classList.remove("selected"));
                accountItem.classList.add("selected");
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-account-btn";
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                try {
                    await eel.delete_account(name)();
                    accountItem.remove();
                    updateAccountSelect();
                    toast({
                        title: "Аккаунт удалён",
                        message: name,
                        type: "info",
                    });
                } catch (e) {}
            });

            accountItem.appendChild(avatar);
            accountItem.appendChild(meta);
            accountItem.appendChild(deleteBtn);
            accountItems.appendChild(accountItem);
        });
        renderAccountCombo();
        updateStats();
    }

    addAccountBtn.addEventListener("click", async () => {
        const login = accountInput.value.trim();
        if (login && isValidLogin(login)) {
            let inserted = false;
            try {
                inserted = await eel.insert_account(login)();
            } catch (e) {}
            if (!inserted) {
                toast({
                    title: "Не удалось добавить",
                    message: "Возможно, такой ник уже есть",
                    type: "error",
                });
                return;
            }
            accountInput.value = "";
            updateAccountSelect();
            toast({
                title: "Offline аккаунт добавлен",
                message: login,
                type: "success",
            });
        } else {
            toast({
                title: "Некорректный ник",
                message: "3–16 символов, латиница, цифры и _",
                type: "error",
            });
        }
    });

    addElyAccountBtn?.addEventListener("click", async () => {
        const username = elyLoginInput.value.trim();
        const password = elyPasswordInput.value;
        if (!username || !password) {
            toast({
                title: "Введите данные Ely.by",
                message: "Нужны логин/e-mail и пароль",
                type: "error",
            });
            return;
        }
        addElyAccountBtn.disabled = true;
        addElyAccountBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Авторизация...';
        try {
            const result = await eel.add_ely_account(username, password)();
            if (!result?.ok) {
                toast({
                    title: "Ely.by не подключён",
                    message: result?.error || "Проверьте данные аккаунта",
                    type: "error",
                });
                return;
            }
            elyPasswordInput.value = "";
            elyLoginInput.value = "";
            await updateAccountSelect();
            toast({
                title: "Ely.by аккаунт добавлен",
                message: result.account?.login || username,
                type: "success",
            });
        } finally {
            addElyAccountBtn.disabled = false;
            addElyAccountBtn.innerHTML =
                '<i class="fas fa-right-to-bracket"></i> Войти через Ely.by';
        }
    });

    accountInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addAccountBtn.click();
    });
    elyPasswordInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addElyAccountBtn?.click();
    });

    updateAccountSelect();
});

// ---------- Versions grid (Home & Builds) with search/filter ----------
let allHomeVersions = [];
let allBuildVersions = [];
let customModpacksById = new Map();

function classifyBuild(version) {
    const v = String(version).toLowerCase();
    if (v.includes("forge")) return "forge";
    if (v.includes("fabric")) return "fabric";
    return "modpack";
}

function buildIcon(type) {
    if (type === "forge") return "fa-hammer";
    if (type === "fabric") return "fa-shirt";
    if (type === "modpack") return "fa-box-archive";
    return "fa-cube";
}

async function requestDeleteModpack(buildId, displayName) {
    const confirmed = await showConfirmDialog({
        title: "Удалить сборку?",
        message: `Сборка «${displayName}» будет удалена вместе со всеми установленными модами и файлами. Действие необратимо.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true,
    });
    if (!confirmed) return;
    try {
        const res = await eel.delete_custom_modpack(buildId)();
        if (res?.ok) {
            toast({
                title: "Сборка удалена",
                message: displayName,
                type: "success",
            });
            const modal = document.getElementById("modpack-modal");
            if (modal && !modal.classList.contains("hidden")) {
                modal.classList.add("hidden");
            }
            await updateVersionGrid();
            await updateVersionSelect();
        } else {
            toast({
                title: "Не удалось удалить",
                message: res?.error || "",
                type: "error",
            });
        }
    } catch (e) {
        toast({ title: "Ошибка удаления", type: "error" });
    }
}

function createVersionCard(version, options = {}) {
    const {
        isInstalled,
        type = null,
        onDownload,
        customBuild = null,
    } = options;

    const card = document.createElement("div");
    card.className = "version-card";
    card.dataset.version = version;
    card.dataset.type = type || "vanilla";

    const cover = document.createElement("div");
    cover.className = `version-card-cover ${type || ""}`;
    cover.innerHTML = `<i class="fas ${type ? buildIcon(type) : "fa-cube"} version-card-cover-icon"></i>`;

    if (type) {
        const typeBadge = document.createElement("span");
        typeBadge.className = "version-type-badge";
        // Пользовательские сборки помечаем статусом «Сборка».
        typeBadge.textContent = customBuild
            ? "Сборка"
            : type === "modpack"
              ? "Сборка"
              : type;
        cover.appendChild(typeBadge);
    }

    if (isInstalled) {
        const installedBadge = document.createElement("span");
        installedBadge.className = "version-installed-badge";
        installedBadge.innerHTML = '<i class="fas fa-check"></i> Установлено';
        cover.appendChild(installedBadge);
    }

    const body = document.createElement("div");
    body.className = "version-card-body";

    const title = document.createElement("div");
    title.className = "version-title";
    title.textContent =
        customBuild?.name || (type ? version : `Minecraft ${version}`);

    let descriptionEl = null;
    if (customBuild?.description) {
        descriptionEl = document.createElement("div");
        descriptionEl.className = "version-description";
        descriptionEl.textContent = customBuild.description;
    }

    const actions = document.createElement("div");
    actions.className = "version-card-actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "download-btn";
    downloadBtn.setAttribute("data-version", version);

    if (isInstalled) {
        downloadBtn.innerHTML = '<i class="fas fa-check"></i> Установлено';
        downloadBtn.classList.add("installed");
        downloadBtn.disabled = true;
    } else {
        downloadBtn.innerHTML = customBuild
            ? '<i class="fas fa-download"></i> Установить'
            : '<i class="fas fa-download"></i> Скачать';
        downloadBtn.addEventListener("click", () => onDownload(downloadBtn));
    }

    actions.appendChild(downloadBtn);

    if (customBuild) {
        // настройки доступны только для пользовательских сборок
        const settingsBtn = document.createElement("button");
        settingsBtn.className = "settings-modpack-btn";
        settingsBtn.innerHTML = '<i class="fas fa-gear"></i>';
        settingsBtn.style.display = isInstalled ? "flex" : "none";
        settingsBtn.title = "Настройки сборки";
        settingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Открыть модальное окно в режиме управления
            openModpackManageModal(version);
        });
        actions.appendChild(settingsBtn);

        // Удаление пользовательской сборки прямо с карточки
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-modpack-btn";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = "Удалить сборку";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            requestDeleteModpack(version, customBuild?.name || version);
        });
        actions.appendChild(deleteBtn);
    }

    body.appendChild(title);
    if (descriptionEl) body.appendChild(descriptionEl);
    body.appendChild(actions);

    card.appendChild(cover);
    card.appendChild(body);
    return card;
}

async function updateVersionGrid() {
    const versionsGridHome = document.querySelector(
        ".content-section#home .versions-grid",
    );
    const versionsGridBuilds = document.querySelector(
        ".content-section#builds .versions-grid",
    );

    let onlineVersions = { releases: [], forge: [], fabric: [] };
    let manifestBuilds = [];
    let customBuilds = [];
    try {
        onlineVersions =
            (await eel.get_online_minecraft_versions(120)()) || onlineVersions;
    } catch (e) {}
    try {
        manifestBuilds = await getManifestBuilds();
    } catch (e) {}
    try {
        customBuilds = (await eel.get_custom_modpacks()()) || [];
    } catch (e) {}
    customModpacksById = new Map(
        customBuilds.map((build) => [build.id || build.build_id, build]),
    );

    const versions = onlineVersions.releases || [];
    const versions_build = [
        ...customBuilds.map((build) => build.id || build.build_id),
        ...manifestBuilds,
        ...(onlineVersions.forge || []),
        ...(onlineVersions.fabric || []),
    ];

    let installedVersions = [];
    try {
        installedVersions = await eel.get_versions()();
    } catch (e) {}
    const installedVersionsSet = new Set(installedVersions.map((v) => v[1]));

    versionsGridHome.innerHTML = "";
    versionsGridBuilds.innerHTML = "";
    allHomeVersions = [];
    allBuildVersions = [];

    // ----- Home grid -----
    versions.forEach((version) => {
        const card = createVersionCard(version, {
            isInstalled: installedVersionsSet.has(version),
            type: null,
            onDownload: async (btn) => {
                const task = {
                    key: getDownloadTaskKey(version, false),
                    version,
                    button: btn,
                    run: async (state) => {
                        circularProgress.classList.add("active");
                        toggleDownloadButtons(true);
                        playBtn.disabled = true;
                        playBtn.innerHTML =
                            '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
                        btn.innerHTML = '<i class="fas fa-ban"></i> Отменить';
                        btn.disabled = false;
                        try {
                            startLauncherLogsStreaming(false);
                            await eel.minecraft_download_version(version)();
                            if (state.cancelRequested) {
                                await cleanupCancelledInstall(
                                    version,
                                    installedVersionsSet,
                                    btn,
                                );
                                toast({
                                    title: "Загрузка отменена",
                                    message: `Minecraft ${version}`,
                                    type: "info",
                                });
                                return;
                            }
                            installedVersionsSet.add(version);
                            try {
                                await eel.insert_version(version)();
                            } catch (e) {}
                            updateVersionSelect();

                            btn.innerHTML =
                                '<i class="fas fa-check"></i> Установлено';
                            btn.classList.add("installed");
                            btn.disabled = true;
                            const cover = btn
                                .closest(".version-card")
                                .querySelector(".version-card-cover");
                            if (
                                cover &&
                                !cover.querySelector(".version-installed-badge")
                            ) {
                                const b = document.createElement("span");
                                b.className = "version-installed-badge";
                                b.innerHTML =
                                    '<i class="fas fa-check"></i> Установлено';
                                cover.appendChild(b);
                            }
                            const settingsBtn = btn
                                .closest(".version-card")
                                ?.querySelector(".settings-modpack-btn");
                            if (settingsBtn) settingsBtn.style.display = "flex";
                            toast({
                                title: "Загружено",
                                message: `Minecraft ${version}`,
                                type: "success",
                            });
                        } catch (error) {
                            if (state.cancelRequested) {
                                await cleanupCancelledInstall(
                                    version,
                                    installedVersionsSet,
                                    btn,
                                );
                            }
                            setDownloadButtonLabel(
                                btn,
                                '<i class="fas fa-download"></i> Скачать',
                                false,
                            );
                            showAlertVersion();
                        } finally {
                            circularProgress.classList.remove("active");
                            toggleDownloadButtons(false);
                            playBtn.innerHTML =
                                '<i class="fas fa-play"></i> Играть';
                            playBtn.disabled = !versionSelect.value;
                            await updateVersionSelect();
                            await updateVersionList();
                            await updateVersionFolderList();
                            updateStats();
                        }
                    },
                };
                enqueueDownloadTask(task);
            },
        });
        versionsGridHome.appendChild(card);
        allHomeVersions.push({ name: version, el: card });
    });

    // ----- Builds grid -----
    versions_build.forEach((version) => {
        const customBuild = customModpacksById.get(version);
        // Пользовательские сборки всегда попадают в раздел «Модпаки».
        const type = customBuild ? "modpack" : classifyBuild(version);
        const card = createVersionCard(version, {
            isInstalled: installedVersionsSet.has(version),
            type,
            customBuild,
            onDownload: async (btn) => {
                const task = {
                    key: getDownloadTaskKey(version, true),
                    version,
                    button: btn,
                    run: async (state) => {
                        circularProgress.classList.add("active");
                        toggleDownloadButtons(true);
                        playBtn.disabled = true;
                        playBtn.innerHTML =
                            '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
                        btn.innerHTML = '<i class="fas fa-ban"></i> Отменить';
                        btn.disabled = false;
                        try {
                            startLauncherLogsStreaming(false);
                            await eel.minecraft_download_version_build(
                                version,
                            )();
                            if (state.cancelRequested) {
                                await cleanupCancelledInstall(
                                    version,
                                    installedVersionsSet,
                                    btn,
                                );
                                toast({
                                    title: "Загрузка отменена",
                                    message: version,
                                    type: "info",
                                });
                                return;
                            }
                            installedVersionsSet.add(version);
                            try {
                                await eel.insert_version(version)();
                            } catch (e) {}
                            updateVersionSelect();

                            btn.innerHTML =
                                '<i class="fas fa-check"></i> Установлено';
                            btn.classList.add("installed");
                            btn.disabled = true;
                            const cover = btn
                                .closest(".version-card")
                                .querySelector(".version-card-cover");
                            if (
                                cover &&
                                !cover.querySelector(".version-installed-badge")
                            ) {
                                const b = document.createElement("span");
                                b.className = "version-installed-badge";
                                b.innerHTML =
                                    '<i class="fas fa-check"></i> Установлено';
                                cover.appendChild(b);
                            }
                            const settingsBtn = btn
                                .closest(".version-card")
                                ?.querySelector(".settings-modpack-btn");
                            if (settingsBtn) settingsBtn.style.display = "flex";
                            toast({
                                title: "Загружено",
                                message: version,
                                type: "success",
                            });
                        } catch (error) {
                            if (state.cancelRequested) {
                                await cleanupCancelledInstall(
                                    version,
                                    installedVersionsSet,
                                    btn,
                                );
                            }
                            setDownloadButtonLabel(
                                btn,
                                '<i class="fas fa-download"></i> Скачать',
                                false,
                            );
                            showAlertVersion();
                        } finally {
                            circularProgress.classList.remove("active");
                            toggleDownloadButtons(false);
                            playBtn.innerHTML =
                                '<i class="fas fa-play"></i> Играть';
                            playBtn.disabled = !versionSelect.value;
                            await updateVersionSelect();
                            await updateVersionList();
                            await updateVersionFolderList();
                            updateStats();
                        }
                    },
                };
                enqueueDownloadTask(task);
            },
        });
        versionsGridBuilds.appendChild(card);
        allBuildVersions.push({ name: version, type, el: card });
    });

    updateBuildsCounts();
    await updateVersionList();
    await updateVersionFolderList();
    await getIpAddress();
    updateStats();
}

function updateBuildsCounts() {
    const counts = {
        all: allBuildVersions.length,
        modpack: 0,
        forge: 0,
        fabric: 0,
    };
    allBuildVersions.forEach((b) => {
        counts[b.type] = (counts[b.type] || 0) + 1;
    });
    document.querySelectorAll("#builds-filter [data-count]").forEach((el) => {
        const k = el.getAttribute("data-count");
        el.textContent = counts[k] ?? 0;
    });
}

// ---------- Search & filter ----------
document.addEventListener("DOMContentLoaded", () => {
    const homeSearch = document.getElementById("home-version-search");
    if (homeSearch) {
        homeSearch.addEventListener("input", () => {
            const q = homeSearch.value.toLowerCase().trim();
            allHomeVersions.forEach(({ name, el }) => {
                el.style.display = name.toLowerCase().includes(q) ? "" : "none";
            });
        });
    }

    const buildsSearch = document.getElementById("builds-search");
    const filterTabs = document.querySelectorAll("#builds-filter .filter-tab");
    let activeFilter = "all";

    function applyBuildsFilter() {
        const q = buildsSearch ? buildsSearch.value.toLowerCase().trim() : "";
        allBuildVersions.forEach(({ name, type, el }) => {
            const matchesText = name.toLowerCase().includes(q);
            const matchesType = activeFilter === "all" || type === activeFilter;
            el.style.display = matchesText && matchesType ? "" : "none";
        });
    }

    filterTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            filterTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            activeFilter = tab.getAttribute("data-filter");
            applyBuildsFilter();
        });
    });

    if (buildsSearch) buildsSearch.addEventListener("input", applyBuildsFilter);
});

// ---------- Stats on home ----------
async function updateStats() {
    let installed = 0,
        accounts = 0,
        servers = 0;
    try {
        installed = (await eel.get_versions()()).length;
    } catch (e) {}
    try {
        accounts = (await eel.get_accounts()()).length;
    } catch (e) {}
    try {
        servers = (await eel.get_ip_address()()).length;
    } catch (e) {}
    const ie = document.getElementById("stat-installed");
    const ae = document.getElementById("stat-accounts");
    const se = document.getElementById("stat-servers");
    if (ie) ie.textContent = installed;
    if (ae) ae.textContent = accounts;
    if (se) se.textContent = servers;

    // playtime stat
    try {
        eel.sum_time()((totalTime) => {
            const time = parseFloat(String(totalTime).replace(",", "."));
            const he = document.getElementById("stat-hours");
            if (he)
                he.innerHTML = `${Math.floor(time)}<span class="unit">ч</span>`;
        });
    } catch (e) {}
}

// ---------- News / Updates feed ----------
const UPDATES_FEED_REMOTE_URL =
    "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/updates.json";
const UPDATES_FEED_LOCAL_FALLBACK_URL = "data/updates.json";
const MODPACKS_MANIFEST_REMOTE_URL =
    "https://raw.githubusercontent.com/XHackerFinnX/SLauncher/main/modpacks_manifest.json";
const MODPACKS_MANIFEST_LOCAL_URL = "data/modpacks_manifest.json";

function parseRuDate(value) {
    const [day, month, year] = String(value || "")
        .split(".")
        .map((n) => Number.parseInt(n, 10));
    if (!day || !month || !year) return 0;
    return new Date(year, month - 1, day).getTime();
}

async function fetchUpdatesFeed(url) {
    const response = await fetch(url, {
        cache: "no-cache",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const updates = await response.json();
    if (!Array.isArray(updates)) {
        throw new Error("updates.json должен быть массивом");
    }
    return updates
        .filter((item) => item && item.version && item.title)
        .sort((a, b) => parseRuDate(b.date) - parseRuDate(a.date));
}

async function getUpdatesFeed() {
    try {
        return await fetchUpdatesFeed(UPDATES_FEED_REMOTE_URL);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось загрузить updates.json из GitHub. Используется локальный fallback.",
            error,
        );
    }

    try {
        return await fetchUpdatesFeed(UPDATES_FEED_LOCAL_FALLBACK_URL);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось загрузить локальный updates.json.",
            error,
        );
        return [];
    }
}

async function getManifestBuilds() {
    const parseManifest = (payload) => {
        const entries = Array.isArray(payload?.builds) ? payload.builds : [];
        return entries
            .map((item) => String(item?.name || "").trim())
            .filter(Boolean);
    };

    try {
        const response = await fetch(MODPACKS_MANIFEST_REMOTE_URL, {
            cache: "no-cache",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return parseManifest(json);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось загрузить манифест сборок из GitHub.",
            error,
        );
    }

    try {
        const response = await fetch(MODPACKS_MANIFEST_LOCAL_URL, {
            cache: "no-cache",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return parseManifest(json);
    } catch (error) {
        console.warn(
            "[SLauncher] Не удалось загрузить локальный манифест сборок.",
            error,
        );
        return [];
    }
}

async function renderUpdatesFeed() {
    const list = document.getElementById("updates-list");
    if (!list) return;

    const updates = await getUpdatesFeed();
    const versionLabel = document.getElementById("launcher-version-label");
    if (versionLabel && updates.length > 0) {
        const latestVersion = String(updates[0].version || "").trim();
        if (latestVersion) {
            versionLabel.textContent = latestVersion;
        }
    }
    if (updates.length === 0) {
        list.innerHTML = `
            <div class="update-card">
                <div class="update-body">
                    <div class="update-header">
                        <span class="update-title">Лента обновлений временно недоступна</span>
                    </div>
                    <ul class="update-changelog">
                        <li>Не удалось получить updates.json с GitHub.</li>
                        <li>Проверьте подключение к интернету и повторите позже.</li>
                    </ul>
                </div>
            </div>
        `;
        return;
    }

    list.innerHTML = updates
        .map(
            (u) => `
        <div class="update-card${u.featured ? " featured" : ""}">
            <div class="update-version">${u.version}</div>
            <div class="update-body">
                <div class="update-header">
                    <span class="update-title">${u.title}</span>
                    ${u.latest ? '<span class="update-tag-latest">Актуально</span>' : ""}
                    <span class="update-date">${u.date}</span>
                </div>
                <ul class="update-changelog">
                    ${u.changes.map((c) => `<li>${c}</li>`).join("")}
                </ul>
                ${
                    u.download
                        ? `
                <div class="update-actions">
                    <button class="btn-primary" id="news-download-btn">
                        <i class="fas fa-download"></i> Скачать обновление
                    </button>
                    <button class="btn-secondary" data-jump-section="home">
                        <i class="fas fa-arrow-right"></i> К версиям игры
                    </button>
                </div>
                `
                        : ""
                }
            </div>
        </div>
    `,
        )
        .join("");

    // wire up download in news
    const ndb = document.getElementById("news-download-btn");
    if (ndb) {
        ndb.addEventListener("click", async () => {
            try {
                try {
                    const hasUpdate = await eel.check_version_launcher()();

                    if (hasUpdate) {
                        toast({
                            title: "Загрузка обновления...",
                            type: "info",
                        });

                        await eel.downolad_launcher_version()();
                        window.close();
                    } else {
                        toast({
                            title: "Установлена актуальная версия",
                            type: "success",
                        });
                    }
                } catch (error) {
                    console.warn(
                        "[SLauncher] Не удалось скачать обновление:",
                        error,
                    );
                    toast({
                        title: "Не удалось проверить обновление",
                        message: "Проверьте интернет-соединение.",
                        type: "error",
                    });
                }
            } catch (e) {
                toast({
                    title: "Уже установлена последняя версия",
                    type: "success",
                });
            }
        });
    }

    // wire up section-jump buttons inside news
    document
        .querySelectorAll("#updates-list [data-jump-section]")
        .forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-jump-section");
                const mi = document.querySelector(
                    `.menu-item[data-section="${id}"]`,
                );
                if (mi) mi.click();
            });
        });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
    const startupSafetyTimeout = setTimeout(() => {
        hideStartupLoader();
    }, 15000);

    try {
        setStartupLoaderText("Загружаем версии и установленные сборки…");
        await updateVersionGrid();

        setStartupLoaderText("Загружаем аккаунты, сервера и статистику…");
        await Promise.allSettled([
            updateVersionSelect(),
            updateServerSelect(),
            updateStats(),
        ]);

        updatePlaytimeOnPage();
        await renderUpdatesFeed();
    } finally {
        clearTimeout(startupSafetyTimeout);
        hideStartupLoader();
    }

    const closeLogBtn = document.getElementById("runtimeLogCloseBtn");
    const clearLogBtn = document.getElementById("runtimeLogClearBtn");
    if (closeLogBtn)
        closeLogBtn.addEventListener("click", hideRuntimeLogsModal);
    if (clearLogBtn) {
        clearLogBtn.addEventListener("click", async () => {
            try {
                await eel.clear_launcher_logs()();
            } catch (e) {}
            const output = document.getElementById("runtimeLogContent");
            if (output) output.textContent = "";
            logPosition = 0;
        });
    }

    const checkBtn = document.getElementById("check-updates-btn");
    if (checkBtn) {
        checkBtn.addEventListener("click", async () => {
            toast({ title: "Проверка обновлений...", type: "info" });
            await checkLauncher(true);
        });
    }
});

function updatePlaytimeOnPage() {
    try {
        eel.sum_time()((totalTime) => {
            const time = parseFloat(String(totalTime).replace(",", "."));
            const hours = Math.floor(time);
            const minutes = Math.round((time - hours) * 60);
            document.querySelector(".playtime-hours").textContent =
                `${hours} ч.`;
            document.querySelector(".playtime-minutes").textContent =
                `${minutes} мин.`;
        });
    } catch (e) {}
}

// ---------- WebSocket helper ----------
function reconnectEel() {
    if (
        eel._websocket &&
        (eel._websocket.readyState === WebSocket.CONNECTING ||
            eel._websocket.readyState === WebSocket.OPEN)
    )
        return;
    try {
        eel._websocket = new WebSocket(
            `http://${window.location.host}/main.html`,
        );
        eel._websocket.onopen = function () {
            setTimeout(updatePlaytimeOnPage, 1000);
        };
        eel._websocket.onclose = function () {
            setTimeout(reconnectEel, 3000);
        };
    } catch (e) {}
}

try {
    eel.expose(updatePlaytimeOnPage);
} catch (e) {}
try {
    eel.expose(updateProgressDownloadLauncher);
} catch (e) {}

// ---------- Update modal ----------
async function checkLauncher(showToast = false) {
    if (launcherUpdateCheckRunning) return false;
    launcherUpdateCheckRunning = true;

    try {
        const hasUpdate = await eel.check_version_launcher()();

        if (hasUpdate) {
            showUpdateModal();
            return true;
        }

        if (showToast) {
            toast({
                title: "Установлена актуальная версия",
                type: "success",
            });
        }

        return false;
    } catch (error) {
        console.warn("[SLauncher] Не удалось проверить обновление:", error);

        if (showToast) {
            toast({
                title: "Проверка обновлений недоступна",
                message: "Лаунчер продолжит работу без проверки.",
                type: "info",
            });
        }

        return false;
    } finally {
        launcherUpdateCheckRunning = false;
    }
}

function showUpdateModal() {
    const modal = document.getElementById("updateModal");
    modal.style.display = "flex";

    const updateButton = document.getElementById("updateButton");
    const laterButton = document.getElementById("laterButton");

    // show badge in sidebar
    const badge = document.getElementById("updates-badge");
    if (badge) badge.style.display = "inline-block";

    updateButton.onclick = () => {
        try {
            eel.downolad_launcher_version();
            window.close();
        } catch (error) {
            closeUpdateModalCircular();
            showErrorMessage();
        }
    };
    laterButton.onclick = () => {
        modal.style.display = "none";
    };
}

function showUpdateModalCircular() {
    const modal = document.getElementById("updateModalCircular");
    modal.style.display = "flex";
}

function closeUpdateModalCircular() {
    const modal = document.getElementById("updateModalCircular");
    modal.style.display = "none";
}

function updateProgressDownloadLauncher(progress) {
    const progressBar = document.querySelector(
        ".circular-progress-update .progress-update",
    );
    const progressTextUpdate = document.querySelector(".progress-text-update");
    const validPercent = Math.min(progress, 100);
    // r=36 → 2π*36 ≈ 226.19
    const dashoffset = 226.19 - (226.19 * validPercent) / 100;
    if (progressBar) progressBar.style.strokeDashoffset = dashoffset;
    if (progressTextUpdate)
        progressTextUpdate.textContent = `${Math.round(validPercent)}%`;
}

function showSuccessMessage() {
    const successModal = document.getElementById("successModal");
    successModal.style.display = "flex";
    const closeButton = document.getElementById("closeSuccessModal");
    closeButton.onclick = function () {
        successModal.style.display = "none";
        setTimeout(() => window.close(), 3000);
    };
}

function showErrorMessage() {
    const errorModal = document.getElementById("errorModal");
    errorModal.style.display = "flex";
    const closeButton = document.getElementById("closeErrorModal");
    closeButton.onclick = function () {
        errorModal.style.display = "none";
    };
}

// document.addEventListener("DOMContentLoaded", () => {
//     checkLauncher();
// });

function send_process_status(status) {
    console.log(status);
}
try {
    eel.expose(send_process_status);
} catch (e) {}

// ---------- Settings tabs + customization ----------
function getRootColorVar(varName, fallback) {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim();
    return value || fallback;
}

function parseCssColorToRgbaParts(cssColor) {
    const value = (cssColor || "").trim();
    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex
                .split("")
                .map((c) => c + c)
                .join("");
        }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return {
            type: "hex",
            hex: `#${hex}`,
            alpha: 1,
            raw: value,
            rgba: `rgba(${r}, ${g}, ${b}, 1)`,
        };
    }
    const rgbaMatch = value.match(
        /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i,
    );
    if (rgbaMatch) {
        const r = Number(rgbaMatch[1]);
        const g = Number(rgbaMatch[2]);
        const b = Number(rgbaMatch[3]);
        const alpha = rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]);
        const hex = `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
        return {
            type: "rgba",
            hex,
            alpha,
            raw: value,
            rgba: `rgba(${r}, ${g}, ${b}, ${alpha})`,
        };
    }
    return { type: "raw", raw: value };
}

document.addEventListener("DOMContentLoaded", async () => {
    const tabs = document.querySelectorAll(".settings-tab");
    const panes = document.querySelectorAll("[data-settings-pane]");
    tabs.forEach((tab) =>
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            const pane = tab.dataset.tab;
            panes.forEach((p) =>
                p.classList.toggle("hidden", p.dataset.settingsPane !== pane),
            );
        }),
    );

    let settings = {};
    try {
        settings = (await eel.get_settings()()) || {};
    } catch (e) {}
    const themeFields = ["bg", "panel", "text", "accent", "accent2"];
    themeFields.forEach((key) => {
        const el = document.getElementById(`theme-${key}`);
        const val = settings[`theme_${key}`];
        if (el && val) {
            el.value = val;
        }
        if (el) el.addEventListener("input", () => applyThemePreview());
    });
    const bgImageInput = document.getElementById("theme-background-image");
    const bgImageOpenBtn = document.getElementById("theme-background-open-btn");
    const themeNameInput = document.getElementById("theme-name");
    const savedThemesList = document.getElementById("saved-themes-list");
    const loadThemeBtn = document.getElementById("load-theme-btn");
    const localBackgroundPreviewCache = new Map();
    const pendingLocalBackgroundReads = new Set();
    const defaultTheme = {
        theme_bg: getRootColorVar("--bg", "#0e1018"),
        theme_panel: getRootColorVar("--panel", "#161826"),
        theme_text: getRootColorVar("--text", "#e6e8f0"),
        theme_accent: getRootColorVar("--accent", "#ffb86c"),
        theme_accent2: getRootColorVar("--accent-2", "#ff9a3c"),
        theme_background_image: "",
    };
    const colorFieldLabels = {
        "bg-2": "Background 2",
        "panel-2": "Panel 2",
        "panel-hover": "Panel hover",
        "text-muted": "Text muted",
        "text-dim": "Text dim",
        info: "Info",
        success: "Success",
        danger: "Danger",
        "on-accent": "Text on accent",
        "on-success": "Text on success",
        "bg-deep": "Deep background",
        "white-06": "White 6%",
        "white-08": "White 8%",
        "white-10": "White 10%",
        "white-12": "White 12%",
        "white-15": "White 15%",
        "white-16": "White 16%",
        "white-85": "White 85%",
        "accent-soft": "Accent soft",
        "accent-glow": "Accent glow",
        "accent-glow-strong": "Accent glow str",
        "accent-glow-soft": "Accent glow soft",
        "accent-border": "Accent border",
        "accent-focus": "Accent focus",
        "accent-bg-soft": "Accent bg soft",
        "accent-bg": "Accent bg",
        "accent-bg-hover": "Accent bg hover",
        "accent-bg-subtle": "Accent bg subtle",
        "accent-glow-max": "Accent glow max",
        "info-bg-soft": "Info bg soft",
        "info-bg": "Info bg",
        "info-bg-subtle": "Info bg subtle",
        "success-bg-soft": "Success bg soft",
        "success-bg-strong": "Success bg strong",
        "success-border": "Success border",
        "danger-bg-soft": "Danger bg soft",
        "danger-bg": "Danger bg",
        "danger-bg-hover": "Danger bg hover",
        "danger-border": "Danger border",
        overlay: "Overlay",
        "overlay-strong": "Overlay strong",
        "overlay-soft": "Overlay soft",
        "black-fade": "Black fade",
        "panel-glass": "Panel glass",
        "panel-glass-strong": "Panel glass strong",
        "panel-solid-soft": "Panel solid soft",
        "bg-solid-soft": "Bg solid soft",
        "shadow-text": "Shadow text",
        "panel-mid-alpha": "Panel mid alpha",
        "preview-grad-warm-1": "Preview warm 1",
        "preview-grad-warm-2": "Preview warm 2",
        "preview-grad-warm-3": "Preview warm 3",
        "preview-grad-cool-1": "Preview cool 1",
        "preview-grad-cool-2": "Preview cool 2",
        "preview-grad-cool-3": "Preview cool 3",
        "preview-grad-arcane-1": "Preview arcane 1",
        "preview-grad-arcane-2": "Preview arcane 2",
        "preview-grad-arcane-3": "Preview arcane 3",
        "preview-grad-nature-1": "Preview nature 1",
        "preview-grad-nature-2": "Preview nature 2",
        "preview-grad-nature-3": "Preview nature 3",
    };
    const advancedThemeFields = [
        "--bg-2",
        "--panel-2",
        "--panel-hover",
        "--text-muted",
        "--text-dim",
        "--info",
        "--success",
        "--danger",
        "--on-accent",
        "--on-success",
        "--bg-deep",
        "--white-06",
        "--white-08",
        "--white-10",
        "--white-12",
        "--white-15",
        "--white-16",
        "--white-85",
        "--accent-soft",
        "--accent-glow",
        "--accent-glow-strong",
        "--accent-glow-soft",
        "--accent-border",
        "--accent-focus",
        "--accent-bg-soft",
        "--accent-bg",
        "--accent-bg-hover",
        "--accent-bg-subtle",
        "--accent-glow-max",
        "--info-bg-soft",
        "--info-bg",
        "--info-bg-subtle",
        "--success-bg-soft",
        "--success-bg-strong",
        "--success-border",
        "--danger-bg-soft",
        "--danger-bg",
        "--danger-bg-hover",
        "--danger-border",
        "--overlay",
        "--overlay-strong",
        "--overlay-soft",
        "--black-fade",
        "--panel-glass",
        "--panel-glass-strong",
        "--panel-solid-soft",
        "--bg-solid-soft",
        "--shadow-text",
        "--panel-mid-alpha",
        "--preview-grad-warm-1",
        "--preview-grad-warm-2",
        "--preview-grad-warm-3",
        "--preview-grad-cool-1",
        "--preview-grad-cool-2",
        "--preview-grad-cool-3",
        "--preview-grad-arcane-1",
        "--preview-grad-arcane-2",
        "--preview-grad-arcane-3",
        "--preview-grad-nature-1",
        "--preview-grad-nature-2",
        "--preview-grad-nature-3",
    ].map((cssVar) => {
        const rawDefault = getRootColorVar(cssVar, "");
        const key = cssVar.replace(/^--/, "").replaceAll("-", "_");
        const parsed = parseCssColorToRgbaParts(rawDefault);
        return {
            key,
            cssVar,
            default: rawDefault,
            parsedDefault: parsed,
            label:
                colorFieldLabels[cssVar.replace(/^--/, "")] ||
                cssVar.replace(/^--/, "").replaceAll("-", " "),
        };
    });
    const advancedGrid = document.getElementById("theme-advanced-grid");
    if (advancedGrid) {
        advancedGrid.innerHTML = advancedThemeFields
            .map((f) =>
                f.parsedDefault.type === "rgba"
                    ? `<label>${f.label}<div class="rgba-editor"><input type="color" id="theme-${f.key.replaceAll("_", "-")}-color" value="${f.parsedDefault.hex}" /><input type="range" min="0" max="1" step="0.01" id="theme-${f.key.replaceAll("_", "-")}-alpha" class="theme-range-fields" value="${f.parsedDefault.alpha}" /><span id="theme-${f.key.replaceAll("_", "-")}-alpha-value">${f.parsedDefault.alpha}</span><input type="hidden" id="theme-${f.key.replaceAll("_", "-")}" value="${f.default}" /></div></label>`
                    : `<label>${f.label}<input type="color" id="theme-${f.key.replaceAll("_", "-")}" value="${f.parsedDefault.hex || f.default}" /></label>`,
            )
            .join("");
        advancedThemeFields.forEach((f) => {
            if (f.parsedDefault.type !== "rgba") return;
            const baseId = `theme-${f.key.replaceAll("_", "-")}`;
            const colorInput = document.getElementById(`${baseId}-color`);
            const alphaInput = document.getElementById(`${baseId}-alpha`);
            const alphaValue = document.getElementById(`${baseId}-alpha-value`);
            const hiddenInput = document.getElementById(baseId);
            const sync = () => {
                const hex = colorInput?.value || "#000000";
                const alpha = alphaInput?.value || "1";
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                if (hiddenInput)
                    hiddenInput.value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                if (alphaValue) alphaValue.textContent = alpha;
                applyThemePreview();
            };
            colorInput?.addEventListener("input", sync);
            alphaInput?.addEventListener("input", sync);
            sync();
        });
    }
    let savedThemes = [];

    async function loadSavedThemes() {
        try {
            savedThemes = (await eel.get_saved_themes()()) || [];
            if (!Array.isArray(savedThemes)) savedThemes = [];
        } catch (e) {
            savedThemes = [];
        }
    }

    function isRemoteOrDataBackground(value) {
        return /^(https?:|data:)/i.test(String(value || "").trim());
    }

    function isLocalBackgroundPath(value) {
        const trimmed = String(value || "").trim();
        return Boolean(trimmed) && !isRemoteOrDataBackground(trimmed);
    }

    function cssUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (isRemoteOrDataBackground(raw) || raw.startsWith("file://")) {
            return raw.replace(/'/g, "\\'");
        }
        const normalized = raw.replace(/\\/g, "/");
        const withScheme = /^[a-z]:\//i.test(normalized)
            ? `file:///${normalized}`
            : normalized;
        return withScheme.replace(/'/g, "\\'");
    }

    async function loadLocalBackgroundPreview(path) {
        const localPath = String(path || "").trim();
        if (
            !isLocalBackgroundPath(localPath) ||
            localBackgroundPreviewCache.has(localPath) ||
            pendingLocalBackgroundReads.has(localPath)
        ) {
            return;
        }
        pendingLocalBackgroundReads.add(localPath);
        try {
            const res = await eel.read_theme_background_image(localPath)();
            if (res?.ok && res.data_url) {
                localBackgroundPreviewCache.set(localPath, res.data_url);
                if (res.path && res.path !== localPath) {
                    localBackgroundPreviewCache.set(res.path, res.data_url);
                }
                if (bgImageInput?.value?.trim() === localPath) {
                    applyThemePreview();
                }
            }
        } catch (e) {
            // If the copied file is missing, keep the URL/file fallback so the
            // rest of the theme still applies without interrupting startup.
        } finally {
            pendingLocalBackgroundReads.delete(localPath);
        }
    }

    function getThemeStripStops(theme) {
        return [
            theme?.theme_bg || "#0e1018",
            theme?.theme_panel || "#161826",
            theme?.theme_text || "#e6e8f0",
            theme?.theme_accent || "#ffb86c",
            theme?.theme_accent2 || "#ff9a3c",
        ];
    }

    function updateSavedThemeStrips() {
        savedThemesList
            ?.querySelectorAll(
                '.saved-theme-item[data-theme-id="__default__"] .cust-saved-strip, .cust-saved-card[data-theme-id="__default__"] .cust-saved-strip',
            )
            .forEach((strip) => {
                strip.innerHTML = getThemeStripStops(defaultTheme)
                    .map(
                        (color) =>
                            `<span style="background:${escapeHtml(color)}"></span>`,
                    )
                    .join("");
            });
    }

    function getCurrentThemePayload() {
        const themeJson = {};
        advancedThemeFields.forEach((f) => {
            themeJson[f.key] =
                document.getElementById(`theme-${f.key.replaceAll("_", "-")}`)
                    ?.value || f.default;
        });
        return {
            theme_bg:
                document.getElementById("theme-bg")?.value ||
                getRootColorVar("--bg", "#0e1018"),
            theme_panel:
                document.getElementById("theme-panel")?.value ||
                getRootColorVar("--panel", "#161826"),
            theme_text:
                document.getElementById("theme-text")?.value ||
                getRootColorVar("--text", "#e6e8f0"),
            theme_accent:
                document.getElementById("theme-accent")?.value ||
                getRootColorVar("--accent", "#ffb86c"),
            theme_accent2:
                document.getElementById("theme-accent2")?.value ||
                getRootColorVar("--accent-2", "#ff9a3c"),
            theme_background_image: bgImageInput?.value?.trim() || "",
            theme_json: themeJson,
        };
    }

    function fillThemeInputs(theme) {
        document.getElementById("theme-bg").value = theme.theme_bg || "#0e1018";
        document.getElementById("theme-panel").value =
            theme.theme_panel || "#161826";
        document.getElementById("theme-text").value =
            theme.theme_text || "#e6e8f0";
        document.getElementById("theme-accent").value =
            theme.theme_accent || "#ffb86c";
        document.getElementById("theme-accent2").value =
            theme.theme_accent2 || "#ff9a3c";
        if (bgImageInput) {
            bgImageInput.value = theme.theme_background_image || "";
            if (
                theme.theme_background_data_url &&
                theme.theme_background_image
            ) {
                localBackgroundPreviewCache.set(
                    theme.theme_background_image,
                    theme.theme_background_data_url,
                );
            }
        }
        let themeJson = {};
        try {
            themeJson = JSON.parse(theme.theme_json || "{}");
        } catch (e) {}
        advancedThemeFields.forEach((f) => {
            const id = `theme-${f.key.replaceAll("_", "-")}`;
            const value = themeJson[f.key] || f.default;
            const el = document.getElementById(id);
            if (el) el.value = value;
            if (f.parsedDefault.type === "rgba") {
                const parsed = parseCssColorToRgbaParts(value);
                const colorInput = document.getElementById(`${id}-color`);
                const alphaInput = document.getElementById(`${id}-alpha`);
                const alphaValue = document.getElementById(`${id}-alpha-value`);
                if (colorInput && parsed.hex) colorInput.value = parsed.hex;
                if (alphaInput && Number.isFinite(parsed.alpha))
                    alphaInput.value = String(parsed.alpha);
                if (alphaValue && Number.isFinite(parsed.alpha))
                    alphaValue.textContent = String(parsed.alpha);
            }
        });
    }

    if (bgImageInput)
        bgImageInput.value = settings.theme_background_image || "";
    function applyThemePreview() {
        document.documentElement.style.setProperty(
            "--bg",
            document.getElementById("theme-bg")?.value || "#0e1018",
        );
        document.documentElement.style.setProperty(
            "--panel",
            document.getElementById("theme-panel")?.value || "#161826",
        );
        document.documentElement.style.setProperty(
            "--text",
            document.getElementById("theme-text")?.value || "#e6e8f0",
        );
        document.documentElement.style.setProperty(
            "--accent",
            document.getElementById("theme-accent")?.value || "#ffb86c",
        );
        document.documentElement.style.setProperty(
            "--accent-2",
            document.getElementById("theme-accent2")?.value || "#ff9a3c",
        );
        const bg = bgImageInput?.value?.trim();
        if (bg) {
            if (
                isLocalBackgroundPath(bg) &&
                !localBackgroundPreviewCache.has(bg)
            ) {
                loadLocalBackgroundPreview(bg);
            }
            const previewBg = localBackgroundPreviewCache.get(bg) || bg;
            document.body.style.backgroundImage = `url('${cssUrl(previewBg)}')`;
        } else {
            document.body.style.backgroundImage = "";
        }
        updateSavedThemeStrips();
        advancedThemeFields.forEach((f) => {
            const val =
                document.getElementById(`theme-${f.key.replaceAll("_", "-")}`)
                    ?.value || f.default;
            document.documentElement.style.setProperty(f.cssVar, val);
        });
    }

    async function saveActiveThemeToBackend(themePayload) {
        try {
            await eel.update_theme_settings(themePayload)();
        } catch (e) {}
    }

    async function applySavedTheme(themePayload) {
        fillThemeInputs(themePayload);
        applyThemePreview();
        await saveActiveThemeToBackend(themePayload);
    }
    function renderSavedThemes() {
        if (!savedThemesList) return;
        const attrsForTheme = (theme, id) =>
            `data-theme-id="${escapeHtml(id)}" data-theme-bg="${escapeHtml(theme.theme_bg || "")}" data-theme-panel="${escapeHtml(theme.theme_panel || "")}" data-theme-text="${escapeHtml(theme.theme_text || "")}" data-theme-accent="${escapeHtml(theme.theme_accent || "")}" data-theme-accent2="${escapeHtml(theme.theme_accent2 || "")}"`;
        const stripForTheme = (theme) =>
            `<div class="cust-saved-strip">${getThemeStripStops(theme)
                .map(
                    (color) =>
                        `<span style="background:${escapeHtml(color)}"></span>`,
                )
                .join("")}</div>`;
        const currentTheme = getCurrentThemePayload();
        const rows = [
            `<div class="saved-theme-item" ${attrsForTheme(defaultTheme, "__default__")}><span class="saved-theme-name">Стандартная тема лаунчера</span>${stripForTheme(defaultTheme)}<button class="select-theme-btn" data-theme-id="__default__">Выбрать</button></div>`,
            ...savedThemes.map(
                (theme) =>
                    `<div class="saved-theme-item" ${attrsForTheme(theme, theme.id)}><span class="saved-theme-name">${escapeHtml(theme.name)}</span>${stripForTheme(theme)}<div class="saved-theme-actions"><button class="select-theme-btn" data-theme-id="${escapeHtml(theme.id)}">Выбрать</button><button class="share-theme-btn" data-theme-id="${escapeHtml(theme.id)}" title="Поделиться"><i class="fas fa-share-nodes"></i></button><button class="delete-theme-btn" data-theme-id="${escapeHtml(theme.id)}" title="Удалить"><i class="fas fa-trash"></i></button></div></div>`,
            ),
        ];
        savedThemesList.innerHTML = rows.join("");
        savedThemesList
            .querySelectorAll(".select-theme-btn")
            .forEach((selectBtn) => {
                selectBtn.addEventListener("click", async () => {
                    const { themeId } = selectBtn.dataset;
                    if (themeId === "__default__") {
                        await applySavedTheme(defaultTheme);
                        toast({
                            title: "Стандартная тема применена",
                            type: "success",
                        });
                        return;
                    }
                    const targetTheme = savedThemes.find(
                        (t) => t.id === themeId,
                    );
                    if (!targetTheme) return;
                    await applySavedTheme(targetTheme);
                    toast({
                        title: `Тема «${targetTheme.name}» применена`,
                        type: "success",
                    });
                });
            });

        savedThemesList.querySelectorAll(".share-theme-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const targetTheme = savedThemes.find(
                    (t) => t.id === btn.dataset.themeId,
                );
                shareSavedTheme(
                    btn.dataset.themeId,
                    targetTheme?.name || "Тема",
                );
            });
        });
        savedThemesList.querySelectorAll(".delete-theme-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                try {
                    await eel.delete_saved_theme(btn.dataset.themeId)();
                    await loadSavedThemes();
                    renderSavedThemes();
                    toast({ title: "Тема удалена", type: "success" });
                } catch (e) {
                    toast({ title: "Ошибка удаления темы", type: "error" });
                }
            });
        });
    }

    function ensureThemeShareModal() {
        let modal = document.getElementById("theme-share-modal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.className = "modpack-modal hidden";
        modal.id = "theme-share-modal";
        modal.innerHTML = `
            <div class="modpack-card share-card">
                <div class="modal-header">
                    <div class="modal-header-left">
                        <div class="modal-icon"><i class="fas fa-share-nodes"></i></div>
                        <div class="modal-header-text">
                            <h3>Поделиться темой</h3>
                            <p id="theme-share-modal-subtitle">Упаковка темы в архив</p>
                        </div>
                    </div>
                    <button id="close-theme-share-modal" class="modal-close-btn"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="share-progress-block" id="theme-share-progress-block">
                        <div class="share-progress-head">
                            <span id="theme-share-progress-stage">Подготовка…</span>
                            <span id="theme-share-progress-percent">0%</span>
                        </div>
                        <div class="task-progress-track"><div class="task-progress-fill" id="theme-share-progress-fill"></div></div>
                        <ul class="share-log" id="theme-share-log"></ul>
                    </div>
                    <div class="share-result hidden" id="theme-share-result">
                        <div class="share-result-icon"><i class="fas fa-circle-check"></i></div>
                        <p class="share-result-title">Тема готова!</p>
                        <p class="share-result-path" id="theme-share-result-path"></p>
                        <button class="btn-primary" id="theme-share-open-folder"><i class="fas fa-folder-open"></i> Открыть папку с архивом</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function ensureThemeImportModal() {
        let modal = document.getElementById("theme-import-modal");
        if (modal) return modal;
        modal = document.createElement("div");
        modal.className = "modpack-modal hidden";
        modal.id = "theme-import-modal";
        modal.innerHTML = `
            <div class="modpack-card share-card">
                <div class="modal-header">
                    <div class="modal-header-left">
                        <div class="modal-icon"><i class="fas fa-file-import"></i></div>
                        <div class="modal-header-text">
                            <h3>Загрузить тему</h3>
                            <p>Перенесите архив темы (.zip / .sltheme.zip)</p>
                        </div>
                    </div>
                    <button id="close-theme-import-modal" class="modal-close-btn"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="import-dropzone" id="theme-import-dropzone" tabindex="0">
                        <i class="fas fa-cloud-arrow-up"></i>
                        <p class="import-dropzone-title">Перетащите архив темы сюда</p>
                        <p class="import-dropzone-sub">или нажмите, чтобы выбрать файл</p>
                        <div class="import-selected hidden" id="theme-import-selected"><i class="fas fa-box-archive"></i> <span id="theme-import-selected-name"></span></div>
                    </div>
                    <div class="import-summary hidden" id="theme-import-summary"></div>
                    <div class="share-progress-block hidden" id="theme-import-progress-block">
                        <div class="share-progress-head"><span id="theme-import-progress-stage">Установка…</span><span id="theme-import-progress-percent">0%</span></div>
                        <div class="task-progress-track"><div class="task-progress-fill" id="theme-import-progress-fill"></div></div>
                        <ul class="share-log" id="theme-import-log"></ul>
                    </div>
                    <div class="modpack-footer"><button class="btn-primary" id="theme-import-install-btn" disabled><i class="fas fa-download"></i> Установить тему</button></div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        wireThemeImportModal(modal);
        return modal;
    }

    function appendModalLog(logEl, message) {
        if (!logEl || !message) return;
        const li = document.createElement("li");
        li.textContent = message;
        logEl.appendChild(li);
        logEl.scrollTop = logEl.scrollHeight;
    }

    async function shareSavedTheme(themeId, themeName) {
        const modal = ensureThemeShareModal();
        const subtitle = document.getElementById("theme-share-modal-subtitle");
        const progressBlock = document.getElementById(
            "theme-share-progress-block",
        );
        const resultBlock = document.getElementById("theme-share-result");
        const stageEl = document.getElementById("theme-share-progress-stage");
        const percentEl = document.getElementById(
            "theme-share-progress-percent",
        );
        const fillEl = document.getElementById("theme-share-progress-fill");
        const logEl = document.getElementById("theme-share-log");
        const resultPath = document.getElementById("theme-share-result-path");
        const closeBtn = document.getElementById("close-theme-share-modal");
        const openFolderBtn = document.getElementById(
            "theme-share-open-folder",
        );
        let lastPath = "";
        const close = () => {
            modal.classList.add("hidden");
            window.__themeShareProgress = null;
        };
        closeBtn.onclick = close;
        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
        openFolderBtn.onclick = async () => {
            try {
                await eel.open_theme_share_folder(lastPath)();
            } catch (e) {}
        };
        modal.classList.remove("hidden");
        if (subtitle) subtitle.textContent = `Упаковка темы «${themeName}»`;
        if (progressBlock) progressBlock.classList.remove("hidden");
        if (resultBlock) resultBlock.classList.add("hidden");
        if (logEl) logEl.innerHTML = "";
        const setProgress = (percent, stage, log) => {
            const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
            if (percentEl) percentEl.textContent = `${p}%`;
            if (fillEl) fillEl.style.width = `${p}%`;
            if (stage && stageEl) stageEl.textContent = stage;
            appendModalLog(logEl, log);
        };
        setProgress(0, "Подготовка…");
        window.__themeShareProgress = setProgress;
        try {
            const res = await eel.share_theme(themeId)();
            window.__themeShareProgress = null;
            if (res?.ok) {
                lastPath = res.path || res.folder || "";
                setProgress(100, "Готово");
                if (resultPath) resultPath.textContent = lastPath;
                if (progressBlock) progressBlock.classList.add("hidden");
                if (resultBlock) resultBlock.classList.remove("hidden");
                toast({
                    title: "Архив темы создан",
                    message: themeName,
                    type: "success",
                });
            } else {
                appendModalLog(logEl, `Ошибка: ${res?.error || "неизвестно"}`);
                toast({
                    title: "Не удалось поделиться темой",
                    message: res?.error || "",
                    type: "error",
                });
            }
        } catch (e) {
            window.__themeShareProgress = null;
            appendModalLog(logEl, "Ошибка упаковки темы");
            toast({ title: "Ошибка упаковки темы", type: "error" });
        }
    }

    function wireThemeImportModal(modal) {
        const closeBtn = modal.querySelector("#close-theme-import-modal");
        const dropzone = modal.querySelector("#theme-import-dropzone");
        const selectedBox = modal.querySelector("#theme-import-selected");
        const selectedName = modal.querySelector("#theme-import-selected-name");
        const summaryEl = modal.querySelector("#theme-import-summary");
        const progressBlock = modal.querySelector(
            "#theme-import-progress-block",
        );
        const stageEl = modal.querySelector("#theme-import-progress-stage");
        const percentEl = modal.querySelector("#theme-import-progress-percent");
        const fillEl = modal.querySelector("#theme-import-progress-fill");
        const logEl = modal.querySelector("#theme-import-log");
        const installBtn = modal.querySelector("#theme-import-install-btn");
        let selectedArchivePath = "";
        const close = () => {
            modal.classList.add("hidden");
            window.__themeImportProgress = null;
        };
        closeBtn?.addEventListener("click", close);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
        });
        const setProgress = (percent, stage, log) => {
            const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
            if (percentEl) percentEl.textContent = `${p}%`;
            if (fillEl) fillEl.style.width = `${p}%`;
            if (stage && stageEl) stageEl.textContent = stage;
            appendModalLog(logEl, log);
        };
        const inspectArchive = async (path) => {
            selectedArchivePath = path;
            if (selectedBox) selectedBox.classList.remove("hidden");
            if (selectedName)
                selectedName.textContent = path.split(/[\\/]/).pop();
            if (summaryEl) {
                summaryEl.classList.remove("hidden");
                summaryEl.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Чтение архива…';
            }
            try {
                const info = await eel.inspect_theme_archive(path)();
                if (!info?.ok) {
                    if (summaryEl)
                        summaryEl.innerHTML = `<span class="import-error">Ошибка: ${escapeHtml(info?.error || "не удалось прочитать")}</span>`;
                    if (installBtn) installBtn.disabled = true;
                    return;
                }
                const m = info.manifest || {};
                if (summaryEl) {
                    summaryEl.innerHTML = `
                        <div class="import-summary-title"><i class="fas fa-palette"></i> ${escapeHtml(m.name || "Тема")}</div>
                        <div class="import-summary-meta">${m.has_background ? "С фоновым изображением" : "Без фонового изображения"}</div>
                        <div class="cust-saved-strip">${getThemeStripStops(m)
                            .map(
                                (color) =>
                                    `<span style="background:${escapeHtml(color)}"></span>`,
                            )
                            .join("")}</div>`;
                }
                if (installBtn) installBtn.disabled = false;
            } catch (e) {
                if (summaryEl)
                    summaryEl.innerHTML =
                        '<span class="import-error">Не удалось прочитать архив</span>';
                if (installBtn) installBtn.disabled = true;
            }
        };
        const pickArchive = async () => {
            try {
                const path = await eel.pick_theme_archive()();
                if (path) inspectArchive(path);
            } catch (e) {
                toast({ title: "Не удалось открыть проводник", type: "error" });
            }
        };
        dropzone?.addEventListener("click", pickArchive);
        dropzone?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickArchive();
            }
        });
        ["dragenter", "dragover"].forEach((ev) =>
            dropzone?.addEventListener(ev, (e) => {
                e.preventDefault();
                dropzone.classList.add("dragover");
            }),
        );
        ["dragleave", "drop"].forEach((ev) =>
            dropzone?.addEventListener(ev, (e) => {
                e.preventDefault();
                dropzone.classList.remove("dragover");
            }),
        );
        dropzone?.addEventListener("drop", async (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (!file) return;
            if (file.path) {
                inspectArchive(file.path);
                return;
            }
            if (summaryEl) {
                summaryEl.classList.remove("hidden");
                summaryEl.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Загрузка файла…';
            }
            try {
                const buf = await file.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = "";
                const CHUNK = 0x8000;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                    binary += String.fromCharCode.apply(
                        null,
                        bytes.subarray(i, i + CHUNK),
                    );
                }
                const saved = await eel.receive_theme_archive(
                    file.name,
                    btoa(binary),
                )();
                if (saved?.ok && saved.path) inspectArchive(saved.path);
                else if (summaryEl)
                    summaryEl.innerHTML =
                        '<span class="import-error">Не удалось сохранить файл</span>';
            } catch (e) {
                if (summaryEl)
                    summaryEl.innerHTML =
                        '<span class="import-error">Не удалось прочитать файл</span>';
            }
        });
        installBtn?.addEventListener("click", async () => {
            if (!selectedArchivePath) return;
            installBtn.disabled = true;
            if (progressBlock) progressBlock.classList.remove("hidden");
            if (logEl) logEl.innerHTML = "";
            setProgress(0, "Подготовка…");
            window.__themeImportProgress = setProgress;
            try {
                const res =
                    await eel.install_theme_archive(selectedArchivePath)();
                window.__themeImportProgress = null;
                if (res?.ok) {
                    setProgress(100, "Готово");
                    if (res.theme) {
                        fillThemeInputs(res.theme);
                        applyThemePreview();
                    }
                    await loadSavedThemes();
                    renderSavedThemes();
                    toast({
                        title: "Тема установлена",
                        message: res.theme_name || "",
                        type: "success",
                    });
                    setTimeout(close, 900);
                } else {
                    appendModalLog(
                        logEl,
                        `Ошибка: ${res?.error || "неизвестно"}`,
                    );
                    installBtn.disabled = false;
                    toast({
                        title: "Не удалось установить тему",
                        message: res?.error || "",
                        type: "error",
                    });
                }
            } catch (e) {
                window.__themeImportProgress = null;
                appendModalLog(logEl, "Ошибка установки темы");
                installBtn.disabled = false;
                toast({ title: "Ошибка установки темы", type: "error" });
            }
        });
    }

    loadThemeBtn?.addEventListener("click", () => {
        const modal = ensureThemeImportModal();
        modal.classList.remove("hidden");
        modal.querySelector("#theme-import-selected")?.classList.add("hidden");
        modal.querySelector("#theme-import-summary")?.classList.add("hidden");
        modal
            .querySelector("#theme-import-progress-block")
            ?.classList.add("hidden");
        const installBtn = modal.querySelector("#theme-import-install-btn");
        if (installBtn) installBtn.disabled = true;
    });

    bgImageInput?.addEventListener("input", () => {
        applyThemePreview();
    });
    bgImageOpenBtn?.addEventListener("click", async () => {
        try {
            const res = await eel.pick_theme_background_image()();
            if (!res?.ok) {
                if (!res?.cancelled) {
                    toast({
                        title: "Не удалось выбрать картинку",
                        message: res?.error || "",
                        type: "error",
                    });
                }
                return;
            }
            if (bgImageInput) bgImageInput.value = res.path || "";
            if (res.path && res.data_url) {
                localBackgroundPreviewCache.set(res.path, res.data_url);
            }
            applyThemePreview();
            toast({
                title: "Фон выбран",
                message: "Предпросмотр обновлён",
                type: "success",
            });
        } catch (e) {
            toast({ title: "Не удалось открыть проводник", type: "error" });
        }
    });
    advancedThemeFields.forEach((f) =>
        document
            .getElementById(`theme-${f.key.replaceAll("_", "-")}`)
            ?.addEventListener("input", applyThemePreview),
    );

    let activeThemeJson = {};
    try {
        activeThemeJson = JSON.parse(settings.theme_json || "{}");
    } catch (e) {
        activeThemeJson = {};
    }
    advancedThemeFields.forEach((f) => {
        const id = `theme-${f.key.replaceAll("_", "-")}`;
        const value = activeThemeJson[f.key];
        if (!value) return;
        const hiddenInput = document.getElementById(id);
        if (hiddenInput) hiddenInput.value = value;
        if (f.parsedDefault.type === "rgba") {
            const parsed = parseCssColorToRgbaParts(value);
            const colorInput = document.getElementById(`${id}-color`);
            const alphaInput = document.getElementById(`${id}-alpha`);
            const alphaValue = document.getElementById(`${id}-alpha-value`);
            if (colorInput && parsed.hex) colorInput.value = parsed.hex;
            if (alphaInput && Number.isFinite(parsed.alpha))
                alphaInput.value = String(parsed.alpha);
            if (alphaValue && Number.isFinite(parsed.alpha))
                alphaValue.textContent = String(parsed.alpha);
        } else {
            const colorInput = document.getElementById(id);
            if (colorInput) colorInput.value = value;
        }
    });

    await loadSavedThemes();
    renderSavedThemes();
    applyThemePreview();
    const saveThemeBtn = document.getElementById("save-theme-btn");
    saveThemeBtn?.addEventListener("click", async () => {
        const themeName = themeNameInput?.value?.trim();
        if (!themeName) {
            toast({ title: "Укажите название темы", type: "error" });
            return;
        }
        const payload = getCurrentThemePayload();
        try {
            if (isLocalBackgroundPath(payload.theme_background_image)) {
                const copyRes = await eel.save_theme_background_copy(
                    payload.theme_background_image,
                    themeName,
                )();
                if (!copyRes?.ok) {
                    toast({
                        title: "Не удалось скопировать фон",
                        message: copyRes?.error || "",
                        type: "error",
                    });
                    return;
                }
                payload.theme_background_image =
                    copyRes.path || payload.theme_background_image;
                if (bgImageInput)
                    bgImageInput.value = payload.theme_background_image;
                if (copyRes.path && copyRes.data_url) {
                    localBackgroundPreviewCache.set(
                        copyRes.path,
                        copyRes.data_url,
                    );
                }
                applyThemePreview();
            }
            await eel.save_named_theme({
                name: themeName,
                ...payload,
            })();
            await eel.update_theme_settings(payload)();
            await loadSavedThemes();
            renderSavedThemes();
            toast({ title: "Тема сохранена", type: "success" });
        } catch (e) {
            toast({ title: "Ошибка сохранения темы", type: "error" });
        }
    });
});

async function openModpackManageModal(buildId) {
    let modpackData = customModpacksById.get(buildId);
    try {
        const fresh = await eel.get_custom_modpack(buildId)();
        if (fresh) modpackData = fresh;
    } catch (e) {}

    if (!modpackData) {
        toast({ title: "Сборка не найдена", type: "error" });
        return;
    }
    openModpackModal("manage", modpackData);
}

function getModrinthUrl(mod) {
    return (
        mod?.url ||
        `https://modrinth.com/mod/${mod?.slug || mod?.project_id || ""}`
    );
}

function openExternalUrl(url) {
    if (!url) return;
    try {
        window.open(url, "_blank");
    } catch (e) {
        location.href = url;
    }
}

let openModpackModal = null;

const CONTENT_META = {
    mod: {
        catalog: "Доступные моды",
        installed: "Установленные моды",
        searchPlaceholder: "Поиск мода...",
        emptyInstalled: "Пока нет установленных модов",
        icon: "fa-puzzle-piece",
        urlKind: "mod",
    },
    resourcepack: {
        catalog: "Доступные текстуры",
        installed: "Установленные текстуры",
        searchPlaceholder: "Поиск текстур-пака...",
        emptyInstalled: "Пока нет установленных текстур",
        icon: "fa-image",
        urlKind: "resourcepack",
    },
    shader: {
        catalog: "Доступные шейдеры",
        installed: "Установленные шейдеры",
        searchPlaceholder: "Поиск шейдеров...",
        emptyInstalled: "Пока нет установленных шейдеров",
        icon: "fa-wand-magic-sparkles",
        urlKind: "shader",
    },
    world: {
        catalog: "Миры",
        installed: "Миры",
        searchPlaceholder: "",
        emptyInstalled: "В этой сборке пока нет миров",
        icon: "fa-earth-americas",
        urlKind: "mod",
    },
};

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("modpack-modal");
    const openBtn = document.getElementById("open-modpack-creator");
    const closeBtn = document.getElementById("close-modpack-modal");
    const modeInput = document.getElementById("modpack-mode");
    const editIdInput = document.getElementById("modpack-edit-id");
    const modalTitle = document.getElementById("modpack-modal-title");
    const modalSubtitle = document.getElementById("modpack-modal-subtitle");
    const saveRow = document.getElementById("modpack-save-row");
    const saveBtn = document.getElementById("modpack-save-btn");

    const createEl = document.getElementById("modpack-create");
    const manageTools = document.getElementById("modpack-manage-tools");
    const createNote = document.getElementById("modpack-create-note");
    const versionSelect = document.getElementById("modpack-version");
    const loaderSelect = document.getElementById("modpack-loader");
    const nameInput = document.getElementById("modpack-name");
    const descInput = document.getElementById("modpack-description");
    const manageDescInput = document.getElementById(
        "modpack-manage-description",
    );
    const manageDescSave = document.getElementById("modpack-desc-save");
    const shareBtn = document.getElementById("modpack-share-btn");
    const deleteBtn = document.getElementById("modpack-delete-btn");
    const worldsPanel = document.getElementById("modpack-worlds-panel");

    const contentTabs = document.getElementById("content-type-tabs");
    const contentTabBtns =
        contentTabs?.querySelectorAll(".content-type-tab") || [];
    const modsLayoutEl = modal?.querySelector(".modpack-mods-layout");
    const catalogTitle = document.getElementById("catalog-title");
    const installedTitle = document.getElementById("installed-title");
    const infoTitle = document.getElementById("modpack-info-title");
    const infoSub = document.getElementById("modpack-info-sub");
    const loaderPill = document.getElementById("modpack-loader-pill");

    const searchInput = document.getElementById("mod-search");
    const sortSelect = document.getElementById("mod-sort");
    const filterToggle = document.getElementById("mod-filter-toggle");
    const filterCount = document.getElementById("mod-filter-count");
    const categoriesEl = document.getElementById("mod-categories");
    const resultsEl = document.getElementById("mods-results");
    const paginationEl = document.getElementById("mods-pagination");
    const prevBtn = document.getElementById("mods-prev");
    const nextBtn = document.getElementById("mods-next");
    const pageIndicator = document.getElementById("mods-page-indicator");
    const installedList = document.getElementById("installed-mods-list");

    // Прогресс установки контента + панель миров
    const installBar = document.getElementById("content-install-bar");
    const installBarName = document.getElementById("content-install-name");
    const installBarPercent = document.getElementById(
        "content-install-percent",
    );
    const installBarFill = document.getElementById("content-install-fill");
    const worldsGrid = document.getElementById("worlds-grid");
    const worldsCount = document.getElementById("worlds-count");
    const worldsOpenFolder = document.getElementById("worlds-open-folder");
    const worldsRefresh = document.getElementById("worlds-refresh");

    const provider = "modrinth";
    let currentManagedBuildId = "";
    let contentType = "mod";

    // Состояние постраничной навигации/фильтров
    const PAGE_SIZE = 20;
    let page = 0;
    let total = 0;
    let hasMore = false;
    let loadingPage = false;
    let installedNames = new Set();
    let selectedCategories = new Set();
    const categoriesCache = {};
    let searchToken = 0;

    openBtn?.addEventListener("click", () => openModpackModal("create"));
    closeBtn?.addEventListener("click", closeModpackModal);

    modal?.addEventListener("click", (e) => {
        if (e.target === modal) closeModpackModal();
    });

    versionSelect?.addEventListener("change", onVersionChange);
    saveBtn?.addEventListener("click", saveCustomModpack);
    searchInput?.addEventListener("input", debounce(resetAndLoad, 350));
    sortSelect?.addEventListener("change", resetAndLoad);
    prevBtn?.addEventListener("click", () => {
        if (loadingPage || page <= 0) return;
        page -= 1;
        loadPage();
    });
    nextBtn?.addEventListener("click", () => {
        if (loadingPage || !hasMore) return;
        page += 1;
        loadPage();
    });
    filterToggle?.addEventListener("click", () => {
        categoriesEl.classList.toggle("hidden");
    });
    deleteBtn?.addEventListener("click", () => {
        if (!currentManagedBuildId) return;
        requestDeleteModpack(
            currentManagedBuildId,
            nameInput.value || currentManagedBuildId,
        );
    });

    // Мини-кнопка сохранения описания (режим управления).
    manageDescSave?.addEventListener("click", async () => {
        if (!currentManagedBuildId) return;
        const description = (manageDescInput?.value || "").trim();
        const original = manageDescSave.innerHTML;
        manageDescSave.disabled = true;
        manageDescSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const result = await eel.save_custom_modpack({
                id: currentManagedBuildId,
                name: nameInput.value.trim(),
                description,
                version: versionSelect.value,
                loader: loaderSelect.value,
                provider,
            })();
            if (result?.ok) {
                descInput.value = description;
                manageDescSave.innerHTML =
                    '<i class="fas fa-check"></i><span>Сохранено</span>';
                toast({ title: "Описание сохранено", type: "success" });
                updateVersionGrid();
            } else {
                manageDescSave.innerHTML = original;
                toast({
                    title: "Не удалось сохранить",
                    message: result?.error || "",
                    type: "error",
                });
            }
        } catch (e) {
            manageDescSave.innerHTML = original;
            toast({ title: "Ошибка сохранения", type: "error" });
        } finally {
            setTimeout(() => {
                manageDescSave.disabled = false;
                manageDescSave.innerHTML = original;
            }, 1400);
        }
    });

    // Поделиться сборкой.
    shareBtn?.addEventListener("click", () => {
        if (!currentManagedBuildId) return;
        startShareBuild(
            currentManagedBuildId,
            nameInput.value || currentManagedBuildId,
        );
    });

    // Кнопки панели миров.
    worldsRefresh?.addEventListener("click", () => loadWorlds());
    worldsOpenFolder?.addEventListener("click", async () => {
        if (!currentManagedBuildId) return;
        try {
            await eel.open_saves_folder(currentManagedBuildId)();
        } catch (e) {
            toast({ title: "Не удалось открыть папку", type: "error" });
        }
    });

    async function loadWorlds() {
        const buildId = currentManagedBuildId || editIdInput.value;
        if (!buildId || !worldsGrid) return;
        worldsGrid.innerHTML =
            '<div class="mod-empty"><i class="fas fa-spinner fa-spin"></i><p>Загрузка миров…</p></div>';
        let worlds = [];
        try {
            worlds = (await eel.list_worlds(buildId)()) || [];
        } catch (e) {
            worldsGrid.innerHTML =
                '<div class="mod-empty"><i class="fas fa-exclamation-triangle"></i><p>Не удалось загрузить миры</p></div>';
            return;
        }
        if (worldsCount) worldsCount.textContent = worlds.length;
        if (!worlds.length) {
            worldsGrid.innerHTML =
                '<div class="mod-empty"><i class="fas fa-earth-americas"></i><p>В этой сборке пока нет миров</p></div>';
            return;
        }
        const GAMEMODES = {
            0: "Выживание",
            1: "Творческий",
            2: "Приключение",
            3: "Наблюдатель",
        };
        worldsGrid.innerHTML = "";
        worlds.forEach((w) => {
            const card = document.createElement("div");
            card.className = "world-card";
            const iconHtml = w.icon
                ? `<img src="${w.icon}" alt="" loading="lazy">`
                : '<div class="world-card-noicon"><i class="fas fa-image"></i></div>';
            const gamemode =
                w.gamemode != null && GAMEMODES[w.gamemode]
                    ? GAMEMODES[w.gamemode]
                    : "";
            const meta = [
                w.version
                    ? `<span><i class="fas fa-cube"></i> ${escapeHtml(w.version)}</span>`
                    : "",
                gamemode
                    ? `<span><i class="fas fa-gamepad"></i> ${escapeHtml(gamemode)}</span>`
                    : "",
                w.hardcore
                    ? `<span class="world-hardcore"><i class="fas fa-heart-crack"></i> Хардкор</span>`
                    : "",
                w.size_label
                    ? `<span><i class="fas fa-hard-drive"></i> ${escapeHtml(w.size_label)}</span>`
                    : "",
                w.last_played
                    ? `<span><i class="fas fa-clock"></i> ${escapeHtml(w.last_played)}</span>`
                    : "",
            ]
                .filter(Boolean)
                .join("");
            card.innerHTML = `
                <div class="world-card-cover">${iconHtml}</div>
                <div class="world-card-body">
                    <div class="world-card-name">${escapeHtml(w.name || w.folder || "Без названия")}</div>
                    <div class="world-card-meta">${meta}</div>
                </div>
                <button class="world-delete-btn" title="Удалить мир"><i class="fas fa-trash"></i></button>`;
            card.querySelector(".world-delete-btn").addEventListener(
                "click",
                async (e) => {
                    e.stopPropagation();
                    const confirmed = await showConfirmDialog({
                        title: "Удалить мир?",
                        message: `Мир «${w.name || w.folder}» будет удалён без возможности восстановления.`,
                        confirmText: "Удалить",
                        cancelText: "Отмена",
                        danger: true,
                    });
                    if (!confirmed) return;
                    try {
                        await eel.delete_world(buildId, w.folder)();
                        loadWorlds();
                        toast({ title: "Мир удалён", type: "info" });
                    } catch (err) {
                        toast({ title: "Ошибка удаления", type: "error" });
                    }
                },
            );
            worldsGrid.appendChild(card);
        });
    }

    contentTabBtns.forEach((tab) => {
        tab.addEventListener("click", () => {
            contentTabBtns.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            contentType = tab.dataset.content || "mod";
            applyContentLabels();
            if (contentType === "world") {
                // Миры — отдельная панель, без каталога Modrinth.
                if (modsLayoutEl) modsLayoutEl.style.display = "none";
                if (worldsPanel) worldsPanel.style.display = "block";
                loadWorlds();
                return;
            }
            if (modsLayoutEl) modsLayoutEl.style.display = "grid";
            if (worldsPanel) worldsPanel.style.display = "none";
            searchInput.value = "";
            selectedCategories.clear();
            renderCategories();
            loadInstalledContent().then(resetAndLoad);
        });
    });

    function applyContentLabels() {
        const meta = CONTENT_META[contentType] || CONTENT_META.mod;
        if (catalogTitle) catalogTitle.textContent = meta.catalog;
        if (installedTitle) installedTitle.textContent = meta.installed;
        if (searchInput) searchInput.placeholder = meta.searchPlaceholder;
        contentTabBtns.forEach((t) =>
            t.classList.toggle("active", t.dataset.content === contentType),
        );
    }

    function setCreateUiVisible(visible) {
        if (createEl) createEl.style.display = visible ? "grid" : "none";
    }

    function setManageUiVisible(visible) {
        if (contentTabs) contentTabs.style.display = visible ? "flex" : "none";
        if (modsLayoutEl)
            modsLayoutEl.style.display = visible ? "grid" : "none";
        if (manageTools) manageTools.style.display = visible ? "block" : "none";
    }

    openModpackModal = function (mode, modpackData = null) {
        if (!modal) return;
        modeInput.value = mode;
        editIdInput.value = modpackData?.id || modpackData?.build_id || "";
        currentManagedBuildId = editIdInput.value;
        contentType = "mod";
        selectedCategories.clear();
        modal.classList.remove("hidden");
        resetModpackFormState();
        applyContentLabels();

        if (mode === "create") {
            modalTitle.textContent = "Создать сборку";
            modalSubtitle.textContent =
                "Заполните данные слева и выберите ядро справа";
            saveBtn.innerHTML = '<i class="fas fa-plus"></i> Создать сборку';
            setCreateUiVisible(true);
            setManageUiVisible(false);
            saveRow.style.display = "flex";
            if (worldsPanel) worldsPanel.style.display = "none";
            nameInput.disabled = false;
            descInput.disabled = false;
            versionSelect.disabled = false;
            loaderSelect.disabled = false;
            loadVersionsIfNeeded();
        } else if (mode === "manage" && modpackData) {
            modalTitle.textContent = "Управление сборкой";
            modalSubtitle.textContent =
                modpackData.name || modpackData.id || "Сборка";
            setCreateUiVisible(false);
            setManageUiVisible(true);
            // В режиме управления нижняя кнопка «Сохранить» не нужна —
            // описание сохраняется своей мини-кнопкой, остальное — при закрытии.
            saveRow.style.display = "none";
            if (worldsPanel) worldsPanel.style.display = "none";
            if (modsLayoutEl) modsLayoutEl.style.display = "grid";
            // Сбрасываем активную вкладку на «Моды».
            contentTabBtns.forEach((t) =>
                t.classList.toggle("active", t.dataset.content === "mod"),
            );
            nameInput.value = modpackData.name || "";
            descInput.value = modpackData.description || modpackData.desc || "";
            if (manageDescInput)
                manageDescInput.value =
                    modpackData.description || modpackData.desc || "";
            versionSelect.innerHTML = `<option value="${escapeHtml(modpackData.version)}">${escapeHtml(modpackData.version)}</option>`;
            loaderSelect.innerHTML = `<option value="${escapeHtml(modpackData.loader)}">${escapeHtml(modpackData.loader === "fabric" ? "Fabric" : "Forge")}</option>`;
            versionSelect.value = modpackData.version || "";
            loaderSelect.value = modpackData.loader || "";
            if (infoTitle) infoTitle.textContent = modpackData.name || "Сборка";
            if (infoSub)
                infoSub.textContent = `Minecraft ${modpackData.version || "?"}`;
            if (loaderPill) {
                const isFabric = modpackData.loader === "fabric";
                loaderPill.textContent = isFabric ? "Fabric" : "Forge";
                loaderPill.className = `modpack-loader-pill ${isFabric ? "fabric" : "forge"}`;
            }
            renderCategories();
            loadInstalledContent().then(resetAndLoad);
        }
    };

    function closeModpackModal() {
        modal?.classList.add("hidden");
    }

    function resetModpackFormState() {
        nameInput.value = "";
        descInput.value = "";
        searchInput.value = "";
        if (sortSelect) sortSelect.value = "relevance";
        resultsEl.innerHTML = "";
        installedList.innerHTML = "";
        categoriesEl.innerHTML = "";
        categoriesEl.classList.add("hidden");
        if (filterCount) filterCount.textContent = "";
        document.getElementById("mods-count-badge").textContent = "0";
        document.getElementById("installed-mods-count").textContent = "0";
        page = 0;
        total = 0;
        hasMore = false;
        if (paginationEl) paginationEl.classList.add("hidden");
        installedNames = new Set();
        if (createNote)
            createNote.textContent = "Ядро появится после выбора версии";
    }

    async function loadVersionsIfNeeded() {
        if (versionSelect.options.length > 1) return;
        versionSelect.innerHTML =
            '<option value="">Загрузка версий...</option>';
        try {
            const online = await eel.get_online_minecraft_versions(120)();
            versionSelect.innerHTML =
                '<option value="">Выберите версию</option>';
            (online.releases || []).forEach((v) => {
                const opt = document.createElement("option");
                opt.value = v;
                opt.textContent = v;
                versionSelect.appendChild(opt);
            });
        } catch (e) {
            versionSelect.innerHTML =
                '<option value="">Ошибка загрузки</option>';
        }
        loaderSelect.innerHTML =
            '<option value="">Сначала выберите версию</option>';
    }

    async function onVersionChange() {
        if (modeInput.value !== "create") return;
        const version = versionSelect.value;
        loaderSelect.innerHTML = '<option value="">Проверяем ядра...</option>';
        loaderSelect.disabled = true;
        if (!version) {
            loaderSelect.innerHTML =
                '<option value="">Сначала выберите версию</option>';
            if (createNote)
                createNote.textContent = "Ядро появится после выбора версии";
            return;
        }

        try {
            const loaders = await eel.get_available_loaders(version)();
            loaderSelect.innerHTML = "";
            if (!loaders.length) {
                loaderSelect.innerHTML =
                    '<option value="">Нет доступных ядер</option>';
                if (createNote)
                    createNote.textContent =
                        "Для этой версии Forge/Fabric не найдены";
                return;
            }
            loaders.forEach((loader) => {
                const opt = document.createElement("option");
                opt.value = loader;
                opt.textContent = loader === "fabric" ? "Fabric" : "Forge";
                loaderSelect.appendChild(opt);
            });
            if (createNote)
                createNote.innerHTML = `<i class="fas fa-check"></i> Доступно: ${loaders.map((l) => (l === "fabric" ? "Fabric" : "Forge")).join(", ")}`;
        } catch (e) {
            loaderSelect.innerHTML =
                '<option value="">Ошибка проверки</option>';
        } finally {
            loaderSelect.disabled = false;
        }
    }

    async function saveCustomModpack() {
        const isManage = modeInput.value === "manage";
        const payload = {
            id: isManage ? editIdInput.value : "",
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
            version: versionSelect.value,
            loader: loaderSelect.value,
            provider,
        };
        if (!payload.name) {
            toast({ title: "Введите название сборки", type: "error" });
            return;
        }
        if (!payload.version || !payload.loader) {
            toast({ title: "Выберите версию и ядро", type: "error" });
            return;
        }
        saveBtn.disabled = true;
        try {
            const result = await eel.save_custom_modpack(payload)();
            if (!result?.ok) {
                toast({
                    title: "Ошибка сохранения",
                    message: result?.error || "Неизвестная ошибка",
                    type: "error",
                });
                return;
            }
            toast({
                title: isManage ? "Описание обновлено" : "Сборка создана",
                message: isManage
                    ? result.build?.name || payload.name
                    : "Нажмите «Установить» в списке сборок, затем «Настроить» для модов",
                type: "success",
            });
            closeModpackModal();
            await updateVersionGrid();
        } catch (e) {
            toast({ title: "Ошибка сохранения", type: "error" });
        } finally {
            saveBtn.disabled = false;
        }
    }

    function contentUrl(item) {
        const meta = CONTENT_META[contentType] || CONTENT_META.mod;
        return (
            item?.url ||
            `https://modrinth.com/${meta.urlKind}/${item?.slug || item?.project_id || ""}`
        );
    }

    // ---------- Категории-фильтры ----------
    async function renderCategories() {
        if (!categoriesEl) return;
        let cats = categoriesCache[contentType];
        if (!cats) {
            categoriesEl.innerHTML =
                '<span class="mod-cat-loading">Загрузка фильтров...</span>';
            try {
                const res = await eel.get_content_filters(contentType)();
                cats = (res && res.categories) || [];
            } catch (e) {
                cats = [];
            }
            categoriesCache[contentType] = cats;
        }
        if (!cats.length) {
            categoriesEl.innerHTML =
                '<span class="mod-cat-loading">Фильтры недоступны</span>';
            return;
        }
        categoriesEl.innerHTML = cats
            .map(
                (c) =>
                    `<button class="mod-cat-chip ${selectedCategories.has(c.name) ? "active" : ""}" data-cat="${escapeHtml(c.name)}">${escapeHtml(c.name)}</button>`,
            )
            .join("");
        categoriesEl.querySelectorAll(".mod-cat-chip").forEach((chip) =>
            chip.addEventListener("click", () => {
                const cat = chip.dataset.cat;
                if (selectedCategories.has(cat)) selectedCategories.delete(cat);
                else selectedCategories.add(cat);
                chip.classList.toggle("active");
                updateFilterCount();
                resetAndLoad();
            }),
        );
        updateFilterCount();
    }

    function updateFilterCount() {
        if (!filterCount) return;
        filterCount.textContent = selectedCategories.size
            ? String(selectedCategories.size)
            : "";
    }

    // ---------- Загрузка каталога постранично ----------
    function resetAndLoad() {
        if (modeInput.value !== "manage" || !versionSelect.value) return;
        page = 0;
        total = 0;
        hasMore = false;
        loadPage();
    }

    function updatePagination() {
        if (!paginationEl) return;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (total <= PAGE_SIZE && page === 0) {
            paginationEl.classList.add("hidden");
        } else {
            paginationEl.classList.remove("hidden");
        }
        if (pageIndicator)
            pageIndicator.textContent = `Стр. ${page + 1} из ${totalPages}`;
        if (prevBtn) prevBtn.disabled = page <= 0 || loadingPage;
        if (nextBtn) nextBtn.disabled = !hasMore || loadingPage;
    }

    async function loadPage() {
        if (loadingPage) return;
        const version = versionSelect.value;
        const loader = loaderSelect.value;
        if (modeInput.value !== "manage" || !version) return;

        loadingPage = true;
        updatePagination();
        const token = ++searchToken;
        resultsEl.innerHTML =
            '<div class="mod-empty"><i class="fas fa-spinner fa-spin"></i><p>Загрузка...</p></div>';
        try {
            const res = await eel.search_content(
                contentType,
                searchInput.value,
                version,
                loader,
                PAGE_SIZE,
                sortSelect ? sortSelect.value : "relevance",
                page * PAGE_SIZE,
                [...selectedCategories],
            )();
            if (token !== searchToken) return; // устаревший ответ
            const items = (res && res.results) || [];
            total = res?.total ?? items.length;
            hasMore = !!res?.has_more;
            document.getElementById("mods-count-badge").textContent =
                total.toLocaleString("ru-RU");

            if (!items.length) {
                resultsEl.innerHTML =
                    '<div class="mod-empty"><i class="fas fa-search"></i><p>Ничего не найдено</p></div>';
                updatePagination();
                return;
            }
            resultsEl.innerHTML = "";
            appendItems(items, version, loader);
            // Прокручиваем список наверх при переходе на новую страницу.
            resultsEl.scrollTop = 0;
        } catch (e) {
            resultsEl.innerHTML =
                '<div class="mod-empty"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки каталога</p></div>';
        } finally {
            loadingPage = false;
            updatePagination();
        }
    }

    function appendItems(items, version, loader) {
        const meta = CONTENT_META[contentType] || CONTENT_META.mod;
        const frag = document.createDocumentFragment();
        items.forEach((m) => {
            const fileBase = (m.title || "").toLowerCase();
            const alreadyByName = [...installedNames].some((n) =>
                n.includes(fileBase),
            );
            const card = document.createElement("div");
            card.className = "mod-card";
            card.dataset.url = contentUrl(m);
            const cats = (m.categories || [])
                .filter((c) => c !== loader)
                .slice(0, 3)
                .map(
                    (c) => `<span class="mod-card-tag">${escapeHtml(c)}</span>`,
                )
                .join("");
            card.innerHTML = `
                <div class="mod-card-top">
                    <div class="mod-card-icon">${m.icon ? `<img src="${escapeHtml(m.icon)}" alt="" loading="lazy">` : `<i class="fas ${meta.icon}"></i>`}</div>
                    <div class="mod-card-headings">
                        <div class="mod-card-name">${escapeHtml(m.title || "Без названия")}</div>
                        <div class="mod-card-author">${escapeHtml(m.author || "")}</div>
                    </div>
                </div>
                <div class="mod-card-desc">${escapeHtml(m.description || "")}</div>
                <div class="mod-card-tags">${cats}</div>
                <div class="mod-card-footer">
                    <span class="mod-card-downloads"><i class="fas fa-download"></i> ${Number(m.downloads || 0).toLocaleString("ru-RU")}</span>
                    <div style="display: flex;">
                        <button class="mod-link-btn" title="Открыть на Modrinth"><i class="fas fa-arrow-up-right-from-square"></i></button>
                        <div class="mod-card-actions">
                            <button class="mod-install-btn ${alreadyByName ? "installed" : ""}" data-id="${escapeHtml(m.project_id)}" data-name="${escapeHtml(m.title || "")}">${alreadyByName ? "Установлено" : "Установить"}</button>
                        </div>
                    </div>
                </div>`;

            card.querySelector(".mod-link-btn").addEventListener(
                "click",
                (e) => {
                    e.stopPropagation();
                    openExternalUrl(card.dataset.url);
                },
            );
            const installBtn = card.querySelector(".mod-install-btn");
            if (!alreadyByName) {
                installBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    handleInstall(installBtn, m, version, loader);
                });
            } else {
                installBtn.disabled = true;
            }
            frag.appendChild(card);
        });
        resultsEl.appendChild(frag);
    }

    // ---------- Установка с разрешением зависимостей ----------
    function showInstallBar(name) {
        if (!installBar) return;
        installBar.classList.remove("hidden");
        if (installBarName)
            installBarName.textContent = name
                ? `Установка: ${name}`
                : "Установка…";
        if (installBarPercent) installBarPercent.textContent = "0%";
        if (installBarFill) {
            installBarFill.classList.remove("indeterminate");
            installBarFill.style.width = "0%";
        }
    }
    function setInstallBar(percent, name) {
        // -1 — размер файла неизвестен: показываем неопределённый прогресс.
        if (percent === -1) {
            if (installBarPercent) installBarPercent.textContent = "…";
            if (installBarFill) installBarFill.classList.add("indeterminate");
            if (name && installBarName)
                installBarName.textContent = `Установка: ${name}`;
            return;
        }
        if (installBarFill) installBarFill.classList.remove("indeterminate");
        const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (installBarPercent) installBarPercent.textContent = `${p}%`;
        if (installBarFill) installBarFill.style.width = `${p}%`;
        if (name && installBarName)
            installBarName.textContent = `Установка: ${name}`;
    }
    function hideInstallBar() {
        if (installBar) installBar.classList.add("hidden");
        window.__contentInstallProgress = null;
    }

    async function installSingle(projectId, version, loader, displayName) {
        showInstallBar(displayName);
        window.__contentInstallProgress = (percent) =>
            setInstallBar(percent, displayName);
        try {
            const r = await eel.install_content(
                contentType,
                provider,
                projectId,
                currentManagedBuildId,
                version,
                loader,
            )();
            setInstallBar(100, displayName);
            return r;
        } finally {
            window.__contentInstallProgress = null;
        }
    }

    async function handleInstall(btn, mod, version, loader) {
        const original = btn.textContent;
        btn.textContent = "Проверка...";
        btn.disabled = true;
        try {
            // Только для модов проверяем зависимости.
            let deps = [];
            if (contentType === "mod") {
                try {
                    const depRes = await eel.resolve_content_dependencies(
                        contentType,
                        mod.project_id,
                        currentManagedBuildId,
                        version,
                        loader,
                    )();
                    deps = (depRes && depRes.dependencies) || [];
                } catch (e) {
                    deps = [];
                }
            }

            const needed = deps.filter((d) => !d.already_installed);
            let toInstall = [];
            if (needed.length) {
                const choice = await showDependencyDialog({
                    modName: mod.title || "Мод",
                    dependencies: deps,
                });
                // choice === [] -> только сам мод (Отменить); иначе выбранные id
                toInstall = choice || [];
            }

            btn.textContent = "Установка...";
            // Сначала зависимости, затем сам мод
            const depById = new Map(deps.map((d) => [d.project_id, d]));
            for (const pid of toInstall) {
                try {
                    await installSingle(
                        pid,
                        version,
                        loader,
                        depById.get(pid)?.title || "зависимость",
                    );
                } catch (e) {}
            }
            const r = await installSingle(
                mod.project_id,
                version,
                loader,
                mod.title || "",
            );
            hideInstallBar();
            if (r.ok) {
                btn.textContent = r.already_installed
                    ? "Уже есть"
                    : "Установлено";
                btn.classList.add("installed");
                await loadInstalledContent();
                if (toInstall.length) {
                    toast({
                        title: "Готово",
                        message: `Установлено зависимостей: ${toInstall.length}`,
                        type: "success",
                    });
                } else if (r.exact === false) {
                    toast({
                        title: "Установлено",
                        message:
                            "Точная версия не найдена, установлена ближайшая совместимая",
                        type: "info",
                    });
                }
            } else {
                btn.textContent = "Ошибка";
                btn.disabled = false;
                toast({
                    title: "Не удалось установить",
                    message: r.error || "",
                    type: "error",
                });
                setTimeout(() => {
                    btn.textContent = original;
                }, 1500);
            }
        } catch (e) {
            hideInstallBar();
            btn.textContent = "Ошибка";
            btn.disabled = false;
        }
    }

    async function loadInstalledContent() {
        const buildId = currentManagedBuildId || editIdInput.value;
        if (!buildId) return;
        const meta = CONTENT_META[contentType] || CONTENT_META.mod;
        try {
            const list =
                (await eel.list_installed_content(contentType, buildId)()) ||
                [];
            installedNames = new Set(
                list.map((m) => String(m.name || "").toLowerCase()),
            );
            document.getElementById("installed-mods-count").textContent =
                list.length;
            if (!list.length) {
                installedList.innerHTML = `<div class="mod-empty"><p>${meta.emptyInstalled}</p></div>`;
                return;
            }
            installedList.innerHTML = list
                .map((m) => {
                    const cleanName = String(m.name || "").replace(
                        /\.(jar|zip)$/i,
                        "",
                    );
                    const url = `https://modrinth.com/${meta.urlKind}s?q=${encodeURIComponent(cleanName)}`;
                    return `
                <div class="installed-mod-chip" data-url="${escapeHtml(url)}" title="Найти на Modrinth">
                    <span class="chip-icon"><i class="fas ${meta.icon}"></i></span>
                    <span class="chip-name">${escapeHtml(m.name)}</span>
                    <span class="chip-remove" data-item="${escapeHtml(m.name)}" title="Удалить"><i class="fas fa-times"></i></span>
                </div>`;
                })
                .join("");

            installedList
                .querySelectorAll(".installed-mod-chip")
                .forEach((chip) =>
                    chip.addEventListener("click", () =>
                        openExternalUrl(chip.dataset.url),
                    ),
                );
            installedList.querySelectorAll(".chip-remove").forEach((el) =>
                el.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const itemName = el.dataset.item;
                    try {
                        await eel.delete_installed_content(
                            contentType,
                            buildId,
                            itemName,
                        )();
                        await loadInstalledContent();
                        toast({
                            title: "Удалено",
                            message: itemName,
                            type: "info",
                        });
                    } catch (err) {
                        toast({ title: "Ошибка удаления", type: "error" });
                    }
                }),
            );
        } catch (e) {
            installedList.innerHTML =
                '<div class="mod-empty"><p>Ошибка загрузки списка</p></div>';
        }
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
});

window.openModpackModal = (...args) => openModpackModal?.(...args);

// ===================== Поделиться сборкой / Загрузить сборку =====================
let startShareBuild = null;

document.addEventListener("DOMContentLoaded", () => {
    // ---------- Share (export) ----------
    const shareModal = document.getElementById("share-modal");
    const closeShare = document.getElementById("close-share-modal");
    const shareSubtitle = document.getElementById("share-modal-subtitle");
    const shareProgressBlock = document.getElementById("share-progress-block");
    const shareStage = document.getElementById("share-progress-stage");
    const sharePercent = document.getElementById("share-progress-percent");
    const shareFill = document.getElementById("share-progress-fill");
    const shareLog = document.getElementById("share-log");
    const shareResult = document.getElementById("share-result");
    const shareResultPath = document.getElementById("share-result-path");
    const shareOpenFolder = document.getElementById("share-open-folder");
    let lastSharePath = "";

    function closeShareModal() {
        shareModal?.classList.add("hidden");
        window.__shareProgress = null;
    }
    closeShare?.addEventListener("click", closeShareModal);
    shareModal?.addEventListener("click", (e) => {
        if (e.target === shareModal) closeShareModal();
    });
    shareOpenFolder?.addEventListener("click", async () => {
        if (!lastSharePath) return;
        try {
            await eel.open_share_folder(lastSharePath)();
        } catch (e) {
            toast({ title: "Не удалось открыть папку", type: "error" });
        }
    });

    function appendShareLog(message) {
        if (!shareLog || !message) return;
        const li = document.createElement("li");
        li.textContent = message;
        shareLog.appendChild(li);
        shareLog.scrollTop = shareLog.scrollHeight;
    }
    function setShareProgress(percent, stage, log) {
        const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (sharePercent) sharePercent.textContent = `${p}%`;
        if (shareFill) shareFill.style.width = `${p}%`;
        if (stage && shareStage) shareStage.textContent = stage;
        if (log) appendShareLog(log);
    }

    startShareBuild = async function (buildId, displayName) {
        if (!shareModal) return;
        shareModal.classList.remove("hidden");
        if (shareSubtitle)
            shareSubtitle.textContent = `Упаковка сборки «${displayName}»`;
        if (shareProgressBlock) shareProgressBlock.classList.remove("hidden");
        if (shareResult) shareResult.classList.add("hidden");
        if (shareLog) shareLog.innerHTML = "";
        lastSharePath = "";
        setShareProgress(0, "Подготовка…");
        window.__shareProgress = setShareProgress;
        try {
            const res = await eel.share_build(buildId)();
            window.__shareProgress = null;
            if (res?.ok) {
                setShareProgress(100, "Готово");
                lastSharePath = res.folder || res.path || "";
                if (shareResultPath)
                    shareResultPath.textContent = res.path || res.folder || "";
                if (shareProgressBlock)
                    shareProgressBlock.classList.add("hidden");
                if (shareResult) shareResult.classList.remove("hidden");
            } else {
                appendShareLog(`Ошибка: ${res?.error || "неизвестно"}`);
                toast({
                    title: "Не удалось собрать архив",
                    message: res?.error || "",
                    type: "error",
                });
            }
        } catch (e) {
            window.__shareProgress = null;
            appendShareLog("Ошибка упаковки сборки");
            toast({ title: "Ошибка при упаковке", type: "error" });
        }
    };

    // ---------- Import (upload) ----------
    const importModal = document.getElementById("import-modal");
    const openImport = document.getElementById("open-modpack-importer");
    const closeImport = document.getElementById("close-import-modal");
    const dropzone = document.getElementById("import-dropzone");
    const selectedBox = document.getElementById("import-selected");
    const selectedName = document.getElementById("import-selected-name");
    const summaryEl = document.getElementById("import-summary");
    const importProgressBlock = document.getElementById(
        "import-progress-block",
    );
    const importStage = document.getElementById("import-progress-stage");
    const importPercent = document.getElementById("import-progress-percent");
    const importFill = document.getElementById("import-progress-fill");
    const importLog = document.getElementById("import-log");
    const importInstallBtn = document.getElementById("import-install-btn");
    let selectedArchivePath = "";

    function closeImportModal() {
        importModal?.classList.add("hidden");
        window.__importProgress = null;
    }
    openImport?.addEventListener("click", () => {
        if (!importModal) return;
        importModal.classList.remove("hidden");
        selectedArchivePath = "";
        if (selectedBox) selectedBox.classList.add("hidden");
        if (summaryEl) {
            summaryEl.classList.add("hidden");
            summaryEl.innerHTML = "";
        }
        if (importProgressBlock) importProgressBlock.classList.add("hidden");
        if (importLog) importLog.innerHTML = "";
        if (importInstallBtn) importInstallBtn.disabled = true;
    });
    closeImport?.addEventListener("click", closeImportModal);
    importModal?.addEventListener("click", (e) => {
        if (e.target === importModal) closeImportModal();
    });

    async function inspectArchive(path) {
        if (!path) return;
        selectedArchivePath = path;
        if (selectedName)
            selectedName.textContent = path.split(/[\\/]/).pop() || path;
        if (selectedBox) selectedBox.classList.remove("hidden");
        if (summaryEl) {
            summaryEl.classList.remove("hidden");
            summaryEl.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Чтение манифеста…';
        }
        try {
            const info = await eel.inspect_build_archive(path)();
            if (!info?.ok) {
                if (summaryEl)
                    summaryEl.innerHTML = `<span class="import-error">Ошибка: ${info?.error || "не удалось прочитать"}</span>`;
                if (importInstallBtn) importInstallBtn.disabled = true;
                return;
            }
            const m = info.manifest || {};
            const counts = info.counts || {};
            if (summaryEl) {
                summaryEl.style.flexDirection = "column";
                summaryEl.innerHTML = `
                    <div class="import-summary-title"><i class="fas fa-box-archive"></i> ${escapeHtml(m.name || "Сборка")}</div>
                    <div class="import-summary-meta">
                        <span><i class="fas fa-cube"></i> Minecraft ${escapeHtml(m.version || "?")}</span>
                        <span><i class="fas fa-layer-group"></i> ${escapeHtml(m.loader === "fabric" ? "Fabric" : m.loader === "forge" ? "Forge" : "Vanilla")}</span>
                    </div>
                    <div class="import-summary-counts">
                        <span><i class="fas fa-puzzle-piece"></i> Моды: ${counts.mod || 0}</span>
                        <span><i class="fas fa-image"></i> Текстуры: ${counts.resourcepack || 0}</span>
                        <span><i class="fas fa-wand-magic-sparkles"></i> Шейдеры: ${counts.shader || 0}</span>
                        <span><i class="fas fa-earth-americas"></i> Миры: ${counts.worlds || 0}</span>
                    </div>`;
            }
            if (importInstallBtn) importInstallBtn.disabled = false;
        } catch (e) {
            if (summaryEl)
                summaryEl.innerHTML =
                    '<span class="import-error">Не удалось прочитать архив</span>';
            if (importInstallBtn) importInstallBtn.disabled = true;
        }
    }

    async function pickArchive() {
        try {
            const path = await eel.pick_build_archive()();
            if (path) inspectArchive(path);
        } catch (e) {
            toast({ title: "Не удалось открыть проводник", type: "error" });
        }
    }

    dropzone?.addEventListener("click", pickArchive);
    dropzone?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickArchive();
        }
    });
    ["dragenter", "dragover"].forEach((ev) =>
        dropzone?.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        }),
    );
    ["dragleave", "drop"].forEach((ev) =>
        dropzone?.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
        }),
    );
    dropzone?.addEventListener("drop", async (e) => {
        const file = e.dataTransfer?.files?.[0];
        console.log("0");
        if (!file) return;
        // 1) Если среда отдаёт полный путь (webview) — используем его напрямую.
        if (file.path) {
            console.log("1");
            inspectArchive(file.path);
            return;
        }
        // 2) Иначе читаем файл и сохраняем во временную папку через backend.
        console.log("2");
        if (summaryEl) {
            summaryEl.classList.remove("hidden");
            summaryEl.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Загрузка файла…';
        }
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
                binary += String.fromCharCode.apply(
                    null,
                    bytes.subarray(i, i + CHUNK),
                );
            }
            const base64 = btoa(binary);
            const saved = await eel.receive_build_archive(file.name, base64)();
            if (saved?.ok && saved.path) {
                inspectArchive(saved.path);
            } else {
                if (summaryEl)
                    summaryEl.innerHTML =
                        '<span class="import-error">Не удалось сохранить файл</span>';
            }
        } catch (err) {
            if (summaryEl)
                summaryEl.innerHTML =
                    '<span class="import-error">Не удалось прочитать файл</span>';
        }
    });

    function appendImportLog(message) {
        if (!importLog || !message) return;
        const li = document.createElement("li");
        li.textContent = message;
        importLog.appendChild(li);
        importLog.scrollTop = importLog.scrollHeight;
    }
    function setImportProgress(percent, stage, log) {
        const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (importPercent) importPercent.textContent = `${p}%`;
        if (importFill) importFill.style.width = `${p}%`;
        if (stage && importStage) importStage.textContent = stage;
        if (log) appendImportLog(log);
    }

    importInstallBtn?.addEventListener("click", async () => {
        if (!selectedArchivePath) return;
        importInstallBtn.disabled = true;
        if (importProgressBlock) importProgressBlock.classList.remove("hidden");
        if (importLog) importLog.innerHTML = "";
        setImportProgress(0, "Подготовка…");
        window.__importProgress = setImportProgress;
        // Прогресс установки ядра идёт по каналу updateProgressDownload.
        // Отображаем его реальным движением полоски в диапазоне 3–54%,
        // чтобы полоска не зависала на 3% во время скачивания ядра.
        let coreLogged = false;
        window.__coreDownloadProgress = (corePercent) => {
            const mapped = 3 + (corePercent / 100) * 51;
            setImportProgress(
                mapped,
                "Установка ядра…",
                !coreLogged ? "Скачивание файлов ядра" : null,
            );
            coreLogged = true;
        };
        try {
            const res = await eel.install_build_archive(selectedArchivePath)();
            window.__importProgress = null;
            window.__coreDownloadProgress = null;
            if (res?.ok) {
                setImportProgress(100, "Готово");
                toast({
                    title: "Сборка установлена",
                    message: res.build_name || "",
                    type: "success",
                });
                // Обновляем и сетку версий, и нижний селект, чтобы импортированная
                // сборка сразу появилась в выборе версий без перезапуска лаунчера.
                await updateVersionGrid();
                await updateVersionSelect();
                setTimeout(closeImportModal, 900);
            } else {
                appendImportLog(`Ошибка: ${res?.error || "неизвестно"}`);
                importInstallBtn.disabled = false;
                toast({
                    title: "Не удалось установить сборку",
                    message: res?.error || "",
                    type: "error",
                });
            }
        } catch (e) {
            window.__importProgress = null;
            window.__coreDownloadProgress = null;
            appendImportLog("Ошибка установки сборки");
            importInstallBtn.disabled = false;
            toast({ title: "Ошибка установки", type: "error" });
        }
    });
});
