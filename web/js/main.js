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

    if (status === "installing") {
        if (inlineLoader) inlineLoader.style.display = "inline-flex";
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Установка...`;
    } else if (status === "installed") {
        progressMessage.textContent = `${checked}/${total} файлов проверено${fileName}. Установлено.`;
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

// ---------- Settings: memory + behavior + java args ----------
document.addEventListener("DOMContentLoaded", async function () {
    const memorySlider = document.getElementById("memory-slider");
    const memoryValue = document.getElementById("memory-value");
    const memoryPresets = document.querySelectorAll(".memory-preset");

    let settings = {};
    try {
        settings = (await eel.get_settings()()) || {};
    } catch (e) {
        console.warn("[StoneLauncher] get_settings недоступно", e);
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
    uniqueVersions.forEach((versionValue) => {
        const option = new Option(`${versionValue}`, versionValue);
        versionSelect.add(option);
        if (versionValue == versiondata) {
            const ss = document.querySelector(".server-select");
            versionSelect.value = versiondata;
            if (versiondata === "LunarПВП 1.8.9") {
                ss.style.display = "block";
            } else {
                ss.style.display = "none";
            }
        }
    });

    playBtn.disabled = !versionSelect.value || isDownloading;
    updateStats();
}

versionSelect.addEventListener("change", () => {
    playBtn.disabled = !versionSelect.value || isDownloading;
});

// ---------- Circular progress ----------
const circularProgress = document.querySelector(".circular-progress");
const progressCircle = document.querySelector(".circular-progress .progress");
const progressText = document.querySelector(".progress-text");

function updateProgressDownload(percent) {
    const validPercent = Math.max(0, Math.min(percent, 100));
    // r=27 → 2π*27 ≈ 169.646
    const dashoffset = 169.646 - (169.646 * validPercent) / 100;
    progressCircle.style.strokeDashoffset = dashoffset;
    progressText.textContent = `${Math.round(validPercent)}%`;
}

try {
    eel.expose(updateProgressDownload);
} catch (e) {}

// ---------- Play button ----------
playBtn.addEventListener("click", async () => {
    const selectedVersion = versionSelect.value;
    const accountSelect = document.querySelector(".account-select");
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

    if (uniqueIps.length === 0) {
        ss.style.display = "none";
    } else {
        ss.style.display = "";
        uniqueIps.forEach((ip) => ss.add(new Option(ip, ip)));
    }
}

// ---------- Accounts ----------
document.addEventListener("DOMContentLoaded", () => {
    const accountInput = document.getElementById("login");
    const addAccountBtn = document.querySelector(".add-account-btn");
    const accountItems = document.querySelector(".account-items");

    async function updateAccountSelect() {
        const accountSelect = document.querySelector(".account-select");
        accountSelect.innerHTML = '<option value="">Выберите аккаунт</option>';
        accountItems.innerHTML = "";

        let accounts = [];
        let accountVersionData = [];
        try {
            accounts = await eel.get_accounts()();
            accountVersionData = await eel.get_account_version()();
        } catch (e) {}

        let logindata1 = "";
        if (accountVersionData.length > 0) {
            [logindata1] = accountVersionData;
        }

        const countEl = document.getElementById("accounts-count");
        if (countEl) countEl.textContent = accounts.length;

        if (accounts.length === 0) {
            accountItems.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <div>Аккаунтов нет</div>
                </div>
            `;
            updateStats();
            return;
        }

        accounts.forEach((account) => {
            const name = account[1];
            const option = new Option(name, name);
            accountSelect.add(option);
            if (name == logindata1) accountSelect.value = logindata1;

            const accountItem = document.createElement("div");
            accountItem.className = "account-item";

            const avatar = document.createElement("div");
            avatar.className = "account-avatar";
            avatar.textContent = name.charAt(0).toUpperCase();

            const nameNode = document.createElement("span");
            nameNode.className = "account-name";
            nameNode.textContent = name;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-account-btn";
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener("click", async () => {
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
            accountItem.appendChild(nameNode);
            accountItem.appendChild(deleteBtn);
            accountItems.appendChild(accountItem);
        });
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
                title: "Аккаунт добавлен",
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

    accountInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addAccountBtn.click();
    });

    updateAccountSelect();
});

// ---------- Versions grid (Home & Builds) with search/filter ----------
let allHomeVersions = [];
let allBuildVersions = [];

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

function createVersionCard(version, options = {}) {
    const { isInstalled, type = null, onDownload } = options;

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
        typeBadge.textContent = type === "modpack" ? "Сборка" : type;
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
    title.textContent = type ? version : `Minecraft ${version}`;

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
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Скачать';
        downloadBtn.addEventListener("click", () => onDownload(downloadBtn));
    }

    actions.appendChild(downloadBtn);

    body.appendChild(title);
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
    try {
        onlineVersions =
            (await eel.get_online_minecraft_versions(120)()) || onlineVersions;
    } catch (e) {}
    try {
        manifestBuilds = await getManifestBuilds();
    } catch (e) {}

    const versions = onlineVersions.releases || [];
    const versions_build = [
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

                try {
                    startLauncherLogsStreaming(false);
                    await eel.minecraft_download_version(version)();
                    installedVersionsSet.add(version);
                    try {
                        await eel.insert_version(version)();
                    } catch (e) {}
                    updateVersionSelect();

                    btn.innerHTML = '<i class="fas fa-check"></i> Установлено';
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
                    toast({
                        title: "Загружено",
                        message: `Minecraft ${version}`,
                        type: "success",
                    });
                } catch (error) {
                    btn.innerHTML = '<i class="fas fa-download"></i> Скачать';
                    btn.disabled = false;
                    showAlertVersion();
                } finally {
                    isDownloading = false;
                    circularProgress.classList.remove("active");
                    toggleDownloadButtons(false);
                    playBtn.innerHTML = '<i class="fas fa-play"></i> Играть';
                    playBtn.disabled = !versionSelect.value;
                    await updateVersionList();
                    await updateVersionFolderList();
                    updateStats();
                }
            },
        });
        versionsGridHome.appendChild(card);
        allHomeVersions.push({ name: version, el: card });
    });

    // ----- Builds grid -----
    versions_build.forEach((version) => {
        const type = classifyBuild(version);
        const card = createVersionCard(version, {
            isInstalled: installedVersionsSet.has(version),
            type,
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

                try {
                    startLauncherLogsStreaming(false);
                    await eel.minecraft_download_version_build(version)();
                    installedVersionsSet.add(version);
                    try {
                        await eel.insert_version(version)();
                    } catch (e) {}
                    updateVersionSelect();

                    btn.innerHTML = '<i class="fas fa-check"></i> Установлено';
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
                    toast({
                        title: "Загружено",
                        message: version,
                        type: "success",
                    });
                } catch (error) {
                    btn.innerHTML = '<i class="fas fa-download"></i> Скачать';
                    btn.disabled = false;
                    showAlertVersion();
                } finally {
                    isDownloading = false;
                    circularProgress.classList.remove("active");
                    toggleDownloadButtons(false);
                    playBtn.innerHTML = '<i class="fas fa-play"></i> Играть';
                    playBtn.disabled = !versionSelect.value;
                    await updateVersionList();
                    await updateVersionFolderList();
                    updateStats();
                }
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
            "[StoneLauncher] Не удалось загрузить updates.json из GitHub. Используется локальный fallback.",
            error,
        );
    }

    try {
        return await fetchUpdatesFeed(UPDATES_FEED_LOCAL_FALLBACK_URL);
    } catch (error) {
        console.warn(
            "[StoneLauncher] Не удалось загрузить локальный updates.json.",
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
            "[StoneLauncher] Не удалось загрузить манифест сборок из GitHub.",
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
            "[StoneLauncher] Не удалось загрузить локальный манифест сборок.",
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
        ndb.addEventListener("click", () => {
            try {
                eel.check_version_launcher()((isUpToDate) => {
                    if (isUpToDate) {
                        eel.downolad_launcher_version();
                        window.close();
                        toast({
                            title: "Загрузка обновления...",
                            type: "info",
                        });
                    } else {
                        toast({
                            title: "Установлена актуальная версия",
                            type: "success",
                        });
                    }
                });
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
        checkBtn.addEventListener("click", () => {
            toast({ title: "Проверка обновлений...", type: "info" });
            try {
                eel.check_version_launcher()((isUpToDate) => {
                    if (isUpToDate) {
                        showUpdateModal();
                    } else {
                        toast({
                            title: "Установлена актуальная версия",
                            type: "success",
                        });
                    }
                });
            } catch (e) {
                toast({
                    title: "Установлена актуальная версия",
                    type: "success",
                });
            }
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
function checkLauncher() {
    try {
        eel.check_version_launcher()((isUpToDate) => {
            if (isUpToDate) showUpdateModal();
        });
    } catch (e) {}
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

document.addEventListener("DOMContentLoaded", () => {
    checkLauncher();
});

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
    const themeNameInput = document.getElementById("theme-name");
    const savedThemesList = document.getElementById("saved-themes-list");
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
        if (bgImageInput)
            bgImageInput.value = theme.theme_background_image || "";
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
            document.body.style.backgroundImage = `url('${bg}')`;
        } else {
            document.body.style.backgroundImage = "";
        }
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
        const rows = [
            `<div class="saved-theme-item"><span>Стандартная тема лаунчера</span><button class="select-theme-btn" data-theme-id="__default__">Выбрать</button></div>`,
            ...savedThemes.map(
                (theme) =>
                    `<div class="saved-theme-item"><span>${theme.name}</span><div class="saved-theme-actions"><button class="select-theme-btn" data-theme-id="${theme.id}">Выбрать</button><button class="delete-theme-btn" data-theme-id="${theme.id}" title="Удалить"><i class="fas fa-trash"></i></button></div></div>`,
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

    bgImageInput?.addEventListener("input", applyThemePreview);
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

// ---------- Modpack creator ----------
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("modpack-modal");
    const openBtn = document.getElementById("open-modpack-creator");
    const closeBtn = document.getElementById("close-modpack-modal");
    const prepareBtn = document.getElementById("prepare-modpack");
    const results = document.getElementById("mods-results");
    const search = document.getElementById("mod-search");
    const installedList = document.getElementById("installed-mods-list");
    let provider = "modrinth";
    openBtn?.addEventListener("click", () => modal?.classList.remove("hidden"));
    closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
    document.querySelectorAll("[data-provider]").forEach((b) =>
        b.addEventListener("click", () => {
            provider = b.dataset.provider;
            document
                .querySelectorAll("[data-provider]")
                .forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            loadMods();
        }),
    );

    async function loadInstalled() {
        const version = document
            .getElementById("modpack-version")
            ?.value?.trim();
        if (!version) return;
        try {
            const list = await eel.list_installed_mods(version)();
            installedList.innerHTML =
                list
                    .map(
                        (m) =>
                            `<div class="update-item"><b>${m.name}</b> <span>${(m.size / 1024 / 1024).toFixed(2)} MB</span></div>`,
                    )
                    .join("") || '<div class="update-item">Пока пусто</div>';
        } catch (e) {}
    }

    async function loadMods() {
        const version = document
            .getElementById("modpack-version")
            ?.value?.trim();
        const loader = document.getElementById("modpack-loader")?.value;
        if (!version || !loader) return;
        results.innerHTML = '<div class="update-item">Загрузка...</div>';
        try {
            const mods = await eel.search_mods(
                provider,
                search.value,
                version,
                loader,
                20,
                "downloads",
            )();
            results.innerHTML =
                mods
                    .map(
                        (m) =>
                            `<div class="update-item"><img src="${m.icon || ""}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;margin-right:8px;"/><div><b>${m.title}</b><div>${m.description || ""}</div></div><button class="btn-secondary install-mod-btn" data-id="${m.project_id}">Установить</button></div>`,
                    )
                    .join("") ||
                '<div class="update-item">Ничего не найдено</div>';
            results.querySelectorAll(".install-mod-btn").forEach((btn) =>
                btn.addEventListener("click", async () => {
                    btn.textContent = "Скачивание...";
                    const res = await eel.install_mod(
                        provider,
                        btn.dataset.id,
                        version,
                        version,
                        loader,
                    )();
                    btn.textContent = res.ok ? "Установлено" : "Ошибка";
                    await loadInstalled();
                }),
            );
        } catch (e) {
            results.innerHTML =
                '<div class="update-item">Ошибка загрузки каталога модов</div>';
        }
    }
    prepareBtn?.addEventListener("click", async () => {
        const version = document
            .getElementById("modpack-version")
            ?.value?.trim();
        const loader = document.getElementById("modpack-loader")?.value;
        if (!version) return;
        const build = `${version}-${loader}`;
        prepareBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Установка...';
        try {
            await eel.minecraft_download_version_build(build)();
            toast({
                title: "Базовая сборка установлена",
                message: build,
                type: "success",
            });
            await loadMods();
            await loadInstalled();
        } catch (e) {
            toast({
                title: "Не удалось установить базовую сборку",
                type: "error",
            });
        }
        prepareBtn.innerHTML = "Установить базу";
    });
    search?.addEventListener("input", () => loadMods());
});
