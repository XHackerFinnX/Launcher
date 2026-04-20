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

// ---------- Server card ----------
function createServerCard(serverData, onDelete) {
    const serverCard = document.createElement("div");
    serverCard.classList.add("server-card");

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
                '<i class="fas fa-server" style="font-size:32px;color:rgba(255,255,255,0.4)"></i>';
            image.replaceWith(placeholder);
        };
    } else {
        image = document.createElement("div");
        image.className = "server-card-image";
        image.style.display = "flex";
        image.style.alignItems = "center";
        image.style.justifyContent = "center";
        image.innerHTML =
            '<i class="fas fa-server" style="font-size:32px;color:rgba(255,255,255,0.4)"></i>';
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

    versionsFromDb.forEach((version) => {
        const option = new Option(`${version[1]}`, version[1]);
        versionSelect.add(option);
        if (version[1] == versiondata) {
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
                const serverData = await eel.check_server_info(ip)();
                if (serverData) {
                    const serverList = document.getElementById("server-list");
                    const serverCard = createServerCard(
                        serverData,
                        async function () {
                            try {
                                await eel.delete_server_by_ip(serverData.ip)();
                                serverList.removeChild(serverCard);
                                updateServerSelect();
                                updateStats();
                                toast({ title: "Сервер удалён", type: "info" });
                            } catch (error) {}
                        },
                    );
                    serverList.appendChild(serverCard);
                    ipInput.value = "";
                    updateServerSelect();
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
        const serverIps = await eel.get_ip_address()();
        const serverList = document.getElementById("server-list");
        serverList.innerHTML = "";

        for (const ip of serverIps) {
            const serverData = await eel.check_server_info(ip)();
            if (serverData) {
                const serverCard = createServerCard(
                    serverData,
                    async function () {
                        try {
                            await eel.delete_server_by_ip(serverData.ip)();
                            serverList.removeChild(serverCard);
                            updateServerSelect();
                            updateStats();
                        } catch (error) {}
                    },
                );
                serverList.appendChild(serverCard);
                updateServerSelect();
            }
        }

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

    if (serverIps.length === 0) {
        ss.style.display = "none";
    } else {
        serverIps.forEach((ip) => ss.add(new Option(ip, ip)));
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
    try {
        onlineVersions =
            (await eel.get_online_minecraft_versions(120)()) || onlineVersions;
    } catch (e) {}

    const versions = onlineVersions.releases || [];
    const versions_build = [
        "Техномагия 1.12.2",
        "LunarПВП 1.8.9",
        "ПВП 1.8.9",
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
                if (isDownloading) return;
                isDownloading = true;
                circularProgress.classList.add("active");
                toggleDownloadButtons(true);
                playBtn.disabled = true;
                playBtn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
                btn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Загрузка';
                btn.disabled = true;

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
                if (isDownloading) return;
                isDownloading = true;
                circularProgress.classList.add("active");
                toggleDownloadButtons(true);
                playBtn.disabled = true;
                playBtn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
                btn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Загрузка';
                btn.disabled = true;

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
function renderUpdatesFeed() {
    const list = document.getElementById("updates-list");
    if (!list) return;
    const updates = [
        {
            version: "v1.8",
            date: "20.04.2026",
            title: "Полный редизайн интерфейса",
            featured: true,
            latest: true,
            changes: [
                "Новый современный дизайн с тёмной темой и оранжевым акцентом",
                "Раздел «Обновления» с полной историей изменений",
                "Поиск и фильтры по типу сборки (Forge, Fabric, Модпаки)",
                "Тосты-уведомления вместо стандартных алертов",
                "Статистика на главной: установлено версий, аккаунтов, серверов",
                "Кнопка копирования IP-адреса сервера",
            ],
            download: true,
        },
        {
            version: "v1.7",
            date: "19.04.2026",
            title: "Стабильность и производительность",
            changes: [
                "Исправлена ошибка запуска для версий 1.20+",
                "Ускорена загрузка модпаков за счёт параллельных потоков",
                "Улучшена работа с G1GC аргументами",
            ],
        },
        {
            version: "v1.6.2",
            date: "22.02.2026",
            title: "Поддержка Fabric 1.20.4",
            changes: [
                "Добавлена поддержка последних сборок Fabric",
                "Обновлён список релизных версий Minecraft",
                "Исправлено отображение времени игры",
            ],
        },
        {
            version: "v1.6",
            date: "12.08.2025",
            title: "Менеджер серверов",
            changes: [
                "Добавлен раздел «Сервера» с проверкой статуса",
                "Возможность сохранять любимые сервера",
                "Просмотр количества онлайн-игроков",
            ],
        },
        {
            version: "v1.5.12",
            date: "11.08.2025",
            title: "Маленькие исправления",
            changes: [],
        },
        {
            version: "v1.5.4",
            date: "10.07.2025",
            title: "Исправлен запуск пвп сборки",
            changes: [],
        },
        {
            version: "v1.5.2",
            date: "09.07.2025",
            title: "Добавлены Forge и Optifine сборки и вводятся готовые сборки",
            changes: ["Добавляется готовая сборка ПВП 1.8.9"],
        },
        {
            version: "v1.4.9",
            date: "22.03.2025",
            title: "Стабильная версия лаунчера для игры по ваниле",
            changes: [],
        },
        {
            version: "v1.3",
            date: "24.02.2025",
            title: "Крупные исправления багов",
            changes: [],
        },
        {
            version: "v1.0",
            date: "21.02.2025",
            title: "Первый релиз лаунчера",
            changes: [],
        },
    ];

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
        renderUpdatesFeed();
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
