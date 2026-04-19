document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", () => {
        document.querySelector(".menu-item.active").classList.remove("active");
        item.classList.add("active");

        const sectionId = item.getAttribute("data-section");
        document
            .querySelector(".content-section.active")
            .classList.remove("active");
        document.getElementById(sectionId).classList.add("active");
    });
});

document.addEventListener("DOMContentLoaded", async function () {
    const memorySlider = document.getElementById("memory-slider");
    const memoryValue = document.getElementById("memory-value");
    const memoryPresets = document.querySelectorAll(".memory-preset");

    // Получаем настройки с сервера
    const settings = await eel.get_settings()();

    // Устанавливаем значение памяти
    memorySlider.value = settings.memory;
    memoryValue.textContent = settings.memory;

    // Обновляем пресеты
    memoryPresets.forEach((preset) => {
        if (preset.dataset.value === settings.memory.toString()) {
            preset.classList.add("active");
        } else {
            preset.classList.remove("active");
        }
    });

    // Обновление отображения памяти
    async function updateMemoryDisplay(value) {
        memoryValue.textContent = value;
        await eel.update_setting_memory(value)();
        memoryPresets.forEach((preset) => {
            if (preset.dataset.value === value.toString()) {
                preset.classList.add("active");
            } else {
                preset.classList.remove("active");
            }
        });
    }

    // Обработчик для изменения значения на ползунке
    memorySlider.addEventListener("input", function () {
        updateMemoryDisplay(this.value);
    });

    // Обработчик для кликов по пресетам
    memoryPresets.forEach((preset) => {
        preset.addEventListener("click", function () {
            const value = this.dataset.value;
            memorySlider.value = value;
            updateMemoryDisplay(value);
        });
    });

    // Управление поведением лаунчера
    const radioButtons = document.querySelectorAll(
        'input[name="launcher-behavior"]'
    );

    // Устанавливаем поведение лаунчера в зависимости от настройки
    if (settings.checkbox === 0) {
        document.querySelector(
            'input[name="launcher-behavior"][value="keep-open"]'
        ).checked = true;
    } else if (settings.checkbox === 1) {
        document.querySelector(
            'input[name="launcher-behavior"][value="close"]'
        ).checked = true;
    }

    // Обработчик для изменения поведения лаунчера
    radioButtons.forEach((button) => {
        button.addEventListener("change", (event) => {
            console.log("Выбранное поведение лаунчера:", event.target.value);
            const checkboxValue = event.target.value === "keep-open" ? 0 : 1;
            eel.update_setting_checkbox(checkboxValue)();
        });
    });

    // Настройка битовой версии и оптимизации
    const bitVersionToggle = document.getElementById("bit-version-toggle");
    const optimizToggle = document.getElementById("optimiz-toggle");

    // Устанавливаем значения для битовой версии и оптимизации
    if (settings.bit_checkbox === 1) {
        bitVersionToggle.checked = true;
    } else {
        bitVersionToggle.checked = false;
    }

    if (settings.optimiz_checkbox === 1) {
        optimizToggle.checked = true;
        bitVersionToggle.checked = true;
    } else {
        optimizToggle.checked = false;
    }

    // Обработчик для битовой версии
    bitVersionToggle.addEventListener("change", function () {
        console.log("64-bit version:", this.checked);
        if (this.checked) {
            eel.update_setting_bit_checkbox(1)();
        } else {
            if (optimizToggle.checked) {
                bitVersionToggle.checked = true;
            } else {
                eel.update_setting_bit_checkbox(0)();
            }
        }
    });

    // Обработчик для оптимизации
    optimizToggle.addEventListener("change", function () {
        console.log("Оптимизация игры:", this.checked);
        if (this.checked) {
            bitVersionToggle.checked = true;
            eel.update_setting_bit_checkbox(1)();
            eel.update_setting_optimiz_checkbox(1)();
        } else {
            eel.update_setting_optimiz_checkbox(0)();
        }
    });

    // Настройка аргументов для игры
    const teneliaArgsToggle = document.getElementById("tenelia-args-toggle");
    const g1gcArgsToggle = document.getElementById("g1gc-args-toggle");
    const customArgsInput = document.getElementById("custom-args-input");

    // Вспомогательная функция для сброса других аргументов
    function updateJavaArguments(activeElement) {
        const elements = [teneliaArgsToggle, g1gcArgsToggle, customArgsInput];

        elements.forEach((element) => {
            if (element !== activeElement) {
                if (element.type === "checkbox") {
                    element.checked = false;
                } else if (element.type === "text") {
                    element.value = "";
                }
            }
        });
    }

    // Устанавливаем аргументы
    if (settings.argument === "Tenelia") {
        teneliaArgsToggle.checked = true;
        updateJavaArguments(teneliaArgsToggle);
    } else if (settings.argument === "G1GC") {
        g1gcArgsToggle.checked = true;
        updateJavaArguments(g1gcArgsToggle);
    } else if (settings.argument) {
        customArgsInput.value = settings.argument;
    }

    // Обработчики для аргументов
    teneliaArgsToggle.addEventListener("change", function () {
        if (this.checked) {
            updateJavaArguments(this);
            console.log("Tenelia arguments enabled");
            eel.update_setting_argument("Tenelia")();
        } else {
            console.log("Tenelia arguments disabled");
            eel.update_setting_argument("")();
        }
    });

    g1gcArgsToggle.addEventListener("change", function () {
        if (this.checked) {
            updateJavaArguments(this);
            console.log("G1GC arguments enabled");
            eel.update_setting_argument("G1GC")();
        } else {
            console.log("G1GC arguments disabled");
            eel.update_setting_argument("")();
        }
    });

    customArgsInput.addEventListener("input", function () {
        if (this.value.trim() !== "") {
            updateJavaArguments(this);
            eel.update_setting_argument(this.value)();
        } else {
            eel.update_setting_argument("")();
        }
    });
});

// Функция для обновления списка версий
async function updateVersionList() {
    // Получаем актуальный список версий через eel
    const versionSelect = document.getElementById("version-select-list");
    const installedVersions = await eel.get_versions()();
    const installedVersionsSet = new Set(
        installedVersions.map((version) => version[1])
    );

    // Очищаем текущий список
    versionSelect.innerHTML = '<option value="">Выберите версию</option>';

    // Добавляем новые версии в выпадающий список
    installedVersionsSet.forEach((version) => {
        const option = document.createElement("option");
        option.value = version;
        option.textContent = version;
        versionSelect.appendChild(option);
    });
}

async function updateVersionFolderList() {
    const versionSelect = document.getElementById("version-select-folder");
    const installedVersions = await eel.get_versions()();
    const installedVersionsSet = new Set(
        installedVersions.map((version) => version[1])
    );

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
    const versionSelect = document.getElementById("version-select-list");
    const message = document.getElementById("delete-message");

    deleteButton.addEventListener("click", async function () {
        const selectedVersion = versionSelect.value;

        if (selectedVersion) {
            const success = await eel.delete_versions_list(selectedVersion)();

            if (success) {
                message.textContent = `Версия ${selectedVersion} удалена.`;
                message.style.display = "block";

                await updateVersionGrid();
                await updateVersionSelect();
            } else {
                message.textContent = "Произошла ошибка при удалении версии.";
                message.style.display = "block";
            }

            versionSelect.value = "";
        } else {
            message.textContent = "Пожалуйста, выберите версию для удаления.";
            message.style.display = "block";
        }
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const selectFolderButton = document.getElementById("select-folder-btn");
    const versionSelect = document.getElementById("version-select-folder");
    const folderMessage = document.getElementById("folder-message");

    selectFolderButton.addEventListener("click", async function () {
        const selectedVersion = versionSelect.value;

        if (selectedVersion) {
            await eel.open_folder_version(selectedVersion)();
        } else {
            folderMessage.textContent =
                "Пожалуйста, выберите версию для открытия папки.";
            folderMessage.style.display = "block";
        }
    });
});

const versionSelect = document.querySelector(".version-select");
const serverSelect = document.querySelector(".server-select");
const playBtn = document.querySelector(".play-btn");
const downloadButtons = document.querySelectorAll(".download-btn");
let installedVersions = new Set();
let isDownloading = false;

function toggleDownloadButtons(disable) {
    downloadButtons.forEach((btn) => {
        btn.disabled = disable;
        if (disable) {
            btn.style.backgroundColor = "#bdc3c7";
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
        } else {
            btn.style.backgroundColor = "#27ae60";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        }
    });
}

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

async function updateVersionSelect() {
    while (versionSelect.options.length > 1) {
        versionSelect.remove(1);
    }

    const versionsFromDb = await eel.get_versions()();
    const accountVersionData = await eel.get_account_version()();

    let logindata = "";
    let versiondata = "";

    if (accountVersionData.length > 0) {
        [logindata, versiondata] = accountVersionData;
    }

    versionsFromDb.forEach((version) => {
        const option = new Option(`${version[1]}`, version[1]);
        versionSelect.add(option);
        if (version[1] == versiondata) {
            var serverSelect = document.querySelector(".server-select");
            versionSelect.value = versiondata;
            if (versiondata === "LunarПВП 1.8.9") {
                serverSelect.style.display = "block";
            } else {
                serverSelect.style.display = "none";
            }
        }
    });

    playBtn.disabled = !versionSelect.value || isDownloading;
}

versionSelect.addEventListener("change", () => {
    playBtn.disabled = !versionSelect.value || isDownloading;
});

const circularProgress = document.querySelector(".circular-progress");
const progressCircle = document.querySelector(".circular-progress .progress");
const progressText = document.querySelector(".progress-text");

function updateProgressDownload(percent) {
    const validPercent = Math.min(percent, 100);

    const dashoffset = 433 - (433 * validPercent) / 100;
    progressCircle.style.strokeDashoffset = dashoffset;
    progressText.textContent = `${Math.round(validPercent)}%`;
}

eel.expose(updateProgressDownload);

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

    if ((selectedVersion === "LunarПВП 1.8.9") & !selectedServer) {
        showAlert();
        return;
    }

    try {
        console.log(
            "запуск игры",
            selectedLogin,
            selectedVersion,
            selectedServer
        );
        const circularProgress = document.querySelector(".circular-progress");

        isDownloading = true;
        circularProgress.classList.add("active");
        toggleDownloadButtons(true);
        playBtn.disabled = true;
        playBtn.textContent = "Загрузка...";

        await eel.update_account_version(selectedLogin, selectedVersion)();
        await eel.start_game(selectedLogin, selectedVersion, selectedServer)();
    } catch {
        console.log("Ошибка");
        showAlertGame();
        launcherCheckClose = false;
    } finally {
        console.log("Игра запущена");
        isDownloading = false;
        circularProgress.classList.remove("active");
        toggleDownloadButtons(false);
        playBtn.textContent = "Играть";
        playBtn.disabled = false;

        if (launcherCheckClose) {
            const canClose = await eel.check_close()();
            if (canClose) {
                window.close();
            }
        }
    }
});

// Функция для проверки состояния WebSocket и переподключения, если необходимо
async function checkWebSocketConnection() {
    if (eel._websocket && eel._websocket.readyState === WebSocket.OPEN) {
        console.log("WebSocket соединён. Можно продолжать.");
    } else if (
        eel._websocket &&
        eel._websocket.readyState === WebSocket.CONNECTING
    ) {
        console.warn(
            "WebSocket ещё соединяется... Пробуем снова через 1 секунду."
        );
        setTimeout(checkWebSocketConnection, 1000); // Пробуем снова через секунду
    } else {
        console.warn("WebSocket закрыт. Переподключаюсь...");
        await reconnectEelPlay();
    }
}

// Функция для переподключения WebSocket
async function reconnectEelPlay() {
    try {
        if (eel._websocket && eel._websocket.readyState === WebSocket.CLOSED) {
            console.warn("WebSocket закрыт, пытаюсь переподключиться...");

            // Перезагрузка страницы для переподключения WebSocket
            eel._websocket = new WebSocket(
                `http://${window.location.host}/main.html`
            ); // Создаем новое подключение
        } else if (
            eel._websocket &&
            eel._websocket.readyState === WebSocket.CONNECTING
        ) {
            console.warn(
                "WebSocket ещё соединяется... Пробуем снова через 1 секунду."
            );
            setTimeout(reconnectEelPlay, 1000); // Пробуем снова через секунду
        } else {
            console.log("WebSocket открыт.");
        }
    } catch (error) {
        console.error("Ошибка при переподключении WebSocket:", error);
        setTimeout(reconnectEelPlay, 1000); // Попробовать снова через 1 секунду
    }
}

document
    .getElementById("add-server-btn")
    .addEventListener("click", async function () {
        const ipInput = document.getElementById("server-ip");
        const ip = ipInput.value.trim();

        if (ip) {
            try {
                const serverData = await eel.check_server_info(ip)();

                if (serverData) {
                    const serverList = document.getElementById("server-list");
                    const serverCard = document.createElement("div");
                    serverCard.classList.add("server-card");

                    serverCard.innerHTML = `
                <img class="server-card-image" src="${serverData.icon}" alt="${
                        serverData.name
                    }">
                    <div class="server-info">
                        <div class="server-title">${serverData.name}</div>
                        <div class="server-status">
                            <div class="player-count">${
                                serverData.players_online
                            } игроков</div>
                            <div class="status ${serverData.status.toLowerCase()}">${
                        serverData.status
                    }</div>
                        </div>
                    </div>
                    <button class="delete-server-btn">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <div class="ip-address">${serverData.ip}</div>
                `;

                    serverList.appendChild(serverCard);

                    ipInput.value = "";
                    updateServerSelect();
                    const deleteButton =
                        serverCard.querySelector(".delete-server-btn");
                    deleteButton.addEventListener("click", async function () {
                        try {
                            console.log(serverData.ip);
                            await eel.delete_server_by_ip(serverData.ip)();
                            serverList.removeChild(serverCard);
                            updateServerSelect();
                        } catch (error) {
                            console.error(
                                "Ошибка при удалении сервера:",
                                error
                            );
                        }
                    });
                } else {
                    showAlertServer();
                }
            } catch (error) {
                console.error("Ошибка при получении данных о сервере:", error);
                showAlertServer();
            }
        } else {
            showAlertServer();
        }
    });

async function getIpAddress() {
    try {
        const serverIps = await eel.get_ip_address()();

        for (const ip of serverIps) {
            const serverData = await eel.check_server_info(ip)();
            if (serverData) {
                const serverList = document.getElementById("server-list");
                const serverCard = document.createElement("div");
                serverCard.classList.add("server-card");

                serverCard.innerHTML = `
                <img class="server-card-image" src="${serverData.icon}" alt="${
                    serverData.name
                }">
                    <div class="server-info">
                        <div class="server-title">${serverData.name}</div>
                        <div class="server-status">
                            <div class="player-count">${
                                serverData.players_online
                            } игроков</div>
                            <div class="status ${serverData.status.toLowerCase()}">${
                    serverData.status
                }</div>
                        </div>
                    </div>
                    <button class="delete-server-btn">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <div class="ip-address">${serverData.ip}</div>
                `;

                serverList.appendChild(serverCard);
                updateServerSelect();
                const deleteButton =
                    serverCard.querySelector(".delete-server-btn");
                deleteButton.addEventListener("click", async function () {
                    try {
                        console.log(serverData.ip);
                        await eel.delete_server_by_ip(serverData.ip)();
                        serverList.removeChild(serverCard);
                        updateServerSelect();
                    } catch (error) {
                        console.error("Ошибка при удалении сервера:", error);
                    }
                });
            } else {
                console.log(
                    `Не удалось получить информацию о сервере с IP ${ip}`
                );
            }
        }
    } catch (error) {
        console.log("Ошибка при загрузке данных о серверах");
    }
}

async function updateServerSelect() {
    // Сначала очищаем старые опции в серверном списке
    const serverSelect = document.querySelector(".server-select");
    while (serverSelect.options.length > 1) {
        serverSelect.remove(1);
    }

    // Получаем список серверов
    const serverIps = await eel.get_ip_address()();

    // Если список серверов пустой, скрываем селект серверов
    if (serverIps.length === 0) {
        serverSelect.style.display = "none";
    } else {
        // Добавляем каждый сервер в список
        serverIps.forEach((ip) => {
            const option = new Option(ip, ip);
            serverSelect.add(option);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const accountInput = document.getElementById("login");
    const addAccountBtn = document.querySelector(".add-account-btn");
    const accountItems = document.querySelector(".account-items");

    async function updateAccountSelect() {
        const accountSelect = document.querySelector(".account-select");
        accountSelect.innerHTML = "";
        accountItems.innerHTML = "";

        const accounts = await eel.get_accounts()();
        const accountVersionData = await eel.get_account_version()();
        let logindata1 = "";
        let versiondata1 = "";

        if (accountVersionData.length > 0) {
            [logindata1, versiondata1] = accountVersionData;
        }
        accounts.forEach((account) => {
            const option = new Option(account[1], account[1]);
            accountSelect.add(option);
            if (account[1] == logindata1) {
                accountSelect.value = logindata1;
            }

            const accountItem = document.createElement("div");
            accountItem.className = "account-item";
            accountItem.innerHTML = `
                <span>${account[1]}</span>
                <button class="delete-account-btn">
                    <i class="fas fa-trash"></i>
                </button>
            `;

            const deleteBtn = accountItem.querySelector(".delete-account-btn");
            deleteBtn.addEventListener("click", async () => {
                await eel.delete_account(account[1])();
                accountItem.remove();
                updateAccountSelect();
            });

            accountItems.appendChild(accountItem);
        });
    }

    addAccountBtn.addEventListener("click", async () => {
        const login = accountInput.value.trim();
        if (login) {
            await eel.insert_account(login)();
            accountInput.value = "";
            updateAccountSelect();
        }
    });

    updateAccountSelect();
});

async function updateVersionGrid() {
    const versionsGridHome = document.querySelector(
        ".content-section#home .versions-grid"
    );
    const versionsGridBuilds = document.querySelector(
        ".content-section#builds .versions-grid"
    );

    const versions = [
        "1.20.1",
        "1.20",
        "1.19.4",
        "1.19.3",
        "1.19.2",
        "1.19.1",
        "1.19",
        "1.18.2",
        "1.18.1",
        "1.18",
        "1.17.1",
        "1.17",
        "1.16.5",
        "1.16.4",
        "1.16.3",
        "1.16.2",
        "1.16.1",
        "1.16",
        "1.15.2",
        "1.15.1",
        "1.15",
        "1.14.4",
        "1.14.3",
        "1.14.2",
        "1.14.1",
        "1.14",
        "1.13.2",
        "1.13.1",
        "1.13",
        "1.12.2",
        "1.12.1",
        "1.12",
        "1.11.2",
        "1.11.1",
        "1.11",
        "1.10.2",
        "1.10.1",
        "1.10",
        "1.9.4",
        "1.9.3",
        "1.9.2",
        "1.9.1",
        "1.9",
        "1.8.9",
        "1.8.8",
        "1.8.7",
        "1.8.6",
        "1.8.5",
        "1.8.4",
        "1.8.3",
        "1.8.2",
        "1.8.1",
        "1.8",
        "1.7.10",
        "1.7.9",
        "1.7.8",
        "1.7.7",
        "1.7.6",
        "1.7.5",
        "1.7.4",
        "1.7.3",
        "1.7.2",
        "1.7.1",
        "1.7",
        "1.6.4",
        "1.6.3",
        "1.6.2",
        "1.6.1",
        "1.6",
        "1.5.2",
        "1.5.1",
        "1.5",
        "1.4.7",
        "1.4.6",
        "1.4.5",
        "1.4.4",
        "1.4.3",
        "1.4.2",
        "1.4.1",
        "1.4",
        "1.3.2",
        "1.3.1",
        "1.3",
        "1.2.5",
        "1.2.4",
        "1.2.3",
        "1.2.2",
        "1.2.1",
        "1.1",
        "1.0",
    ];
    const versions_build = [
        "Техномагия 1.12.2",
        "LunarПВП 1.8.9",
        "ПВП 1.8.9",
        "Forge 1.21.4",
        "Forge 1.21.3",
        "Forge 1.21.1",
        "Forge 1.21",
        "Forge 1.20.6",
        "ForgeOptifine 1.20.4",
        "Forge 1.20.3",
        "ForgeOptifine 1.20.2",
        "ForgeOptifine 1.20.1",
        "Forge 1.20",
        "Forge 1.19.4",
        "Forge 1.19.3",
        "Forge 1.19.2",
        "Forge 1.19.1",
        "Forge 1.19",
        "Forge 1.18.2",
        "Forge 1.18.1",
        "Forge 1.18",
        "Forge 1.17.1",
        "Forge 1.16.5",
        "Forge 1.16.4",
        "Forge 1.16.3",
        "Forge 1.16.2",
        "Forge 1.16.1",
        "Forge 1.15.2",
        "Forge 1.15.1",
        "Forge 1.15",
        "Forge 1.14.4",
        "Forge 1.14.3",
        "Forge 1.14.2",
        "Forge 1.13.2",
        "ForgeOptifine 1.12.2",
        "Forge 1.12.1",
        "Forge 1.12",
        "ForgeOptifine 1.11.2",
        "Forge 1.11",
        "ForgeOptifine 1.10.2",
        "Forge 1.10",
        "ForgeOptifine 1.9.4",
        "Forge 1.9",
        "ForgeOptifine 1.8.9",
        "Forge 1.8.8",
        "Forge 1.8",
        "ForgeOptifine 1.7.10",
    ];

    const installedVersions = await eel.get_versions()();
    const installedVersionsSet = new Set(
        installedVersions.map((version) => version[1])
    );

    versionsGridHome.innerHTML = "";
    versionsGridBuilds.innerHTML = "";

    // Обновляем версии для home
    versions.forEach((version) => {
        const versionCardHome = document.createElement("div");
        versionCardHome.className = "version-card";

        const versionTitleHome = document.createElement("div");
        versionTitleHome.className = "version-title";
        versionTitleHome.textContent = `Версия ${version}`;

        const downloadBtnHome = document.createElement("button");
        downloadBtnHome.className = "download-btn";
        downloadBtnHome.setAttribute("data-version", version);

        if (installedVersionsSet.has(version)) {
            downloadBtnHome.innerHTML = '<i class="fas fa-check"></i>';
            downloadBtnHome.classList.add("installed");
            downloadBtnHome.style.backgroundColor = "#27ae60";
            downloadBtnHome.disabled = true;
        } else {
            downloadBtnHome.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtnHome.addEventListener("click", async () => {
                if (isDownloading) return;
                const circularProgress =
                    document.querySelector(".circular-progress");

                isDownloading = true;
                circularProgress.classList.add("active");
                toggleDownloadButtons(true);
                playBtn.disabled = true;
                playBtn.textContent = "Загрузка...";

                try {
                    console.log("Загрузка версии майнкрафт", version);
                    await eel.minecraft_download_version(version)();
                    console.log("Загрузка версии майнкрафт завершена", version);
                    installedVersionsSet.add(version);

                    await eel.insert_version(version)();
                    updateVersionSelect();

                    downloadBtnHome.innerHTML = '<i class="fas fa-check"></i>';
                    downloadBtnHome.style.backgroundColor = "#27ae60";
                    downloadBtnHome.classList.add("installed");
                    downloadBtnHome.disabled = true;
                } catch (error) {
                    downloadBtnHome.style.backgroundColor = "#e74c3c";
                    showAlertVersion();
                } finally {
                    isDownloading = false;
                    circularProgress.classList.remove("active");
                    toggleDownloadButtons(false);
                    playBtn.textContent = "Играть";
                    playBtn.disabled = !versionSelect.value;
                    console.log("Обновление списка home");
                    await updateVersionList();
                    await updateVersionFolderList();
                }
            });
        }

        versionCardHome.appendChild(versionTitleHome);
        versionCardHome.appendChild(downloadBtnHome);
        versionsGridHome.appendChild(versionCardHome);
    });

    // Обновляем версии для builds
    versions_build.forEach((version) => {
        const versionCardBuilds = document.createElement("div");
        versionCardBuilds.className = "version-card";

        const versionTitleBuilds = document.createElement("div");
        versionTitleBuilds.className = "version-title";
        versionTitleBuilds.textContent = `${version}`;

        const downloadBtnBuilds = document.createElement("button");
        downloadBtnBuilds.className = "download-btn";
        downloadBtnBuilds.setAttribute("data-version", version);

        if (installedVersionsSet.has(version)) {
            downloadBtnBuilds.innerHTML = '<i class="fas fa-check"></i>';
            downloadBtnBuilds.classList.add("installed");
            downloadBtnBuilds.style.backgroundColor = "#27ae60";
            downloadBtnBuilds.disabled = true;
        } else {
            downloadBtnBuilds.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtnBuilds.addEventListener("click", async () => {
                if (isDownloading) return;

                const circularProgress =
                    document.querySelector(".circular-progress");

                isDownloading = true;
                circularProgress.classList.add("active");
                toggleDownloadButtons(true);
                playBtn.disabled = true;
                playBtn.textContent = "Загрузка...";

                try {
                    console.log("Загрузка версии майнкрафт", version);
                    await eel.minecraft_download_version_build(version)();
                    console.log("Загрузка версии майнкрафт завершена", version);
                    installedVersionsSet.add(version);

                    await eel.insert_version(version)();
                    updateVersionSelect();

                    downloadBtnBuilds.innerHTML =
                        '<i class="fas fa-check"></i>';
                    downloadBtnBuilds.style.backgroundColor = "#27ae60";
                    downloadBtnBuilds.classList.add("installed");
                    downloadBtnBuilds.disabled = true;
                } catch (error) {
                    downloadBtnBuilds.style.backgroundColor = "#e74c3c";
                    showAlertVersion();
                } finally {
                    isDownloading = false;
                    circularProgress.classList.remove("active");
                    toggleDownloadButtons(false);
                    playBtn.textContent = "Играть";
                    playBtn.disabled = !versionSelect.value;
                    console.log("Обновление списка builds");
                    await updateVersionList();
                    await updateVersionFolderList();
                }
            });
        }
        versionCardBuilds.appendChild(versionTitleBuilds);
        versionCardBuilds.appendChild(downloadBtnBuilds);
        versionsGridBuilds.appendChild(versionCardBuilds);
    });
    await updateVersionList();
    await updateVersionFolderList();
    await getIpAddress();
}

document.addEventListener("DOMContentLoaded", () => {
    updateVersionGrid();
    updateVersionSelect();
    updatePlaytimeOnPage();
    updateServerSelect();
});

function updatePlaytimeOnPage() {
    eel.sum_time()(function (totalTime) {
        // Заменяем запятую на точку для корректного парсинга
        const time = parseFloat(String(totalTime).replace(',', '.'));

        // Целая часть — часы
        const hours = Math.floor(time);

        // Дробная часть * 60 = минуты
        const minutes = Math.round((time - hours) * 60);

        // Записываем
        document.querySelector(".playtime-hours").textContent = `${hours} ч.`;
        document.querySelector(".playtime-minutes").textContent = `${minutes} мин.`;

        console.log(`Время успешно записано: ${hours} ч. ${minutes} мин.`);
    });
}

// Функция для переподключения WebSocket
function reconnectEel() {
    if (
        eel._websocket &&
        (eel._websocket.readyState === WebSocket.CONNECTING ||
            eel._websocket.readyState === WebSocket.OPEN)
    ) {
        console.warn("WebSocket уже пытается подключиться...");
        return;
    }

    eel._websocket = new WebSocket(`http://${window.location.host}/main.html`); // Создаем новое подключение

    eel._websocket.onopen = function () {
        console.log("WebSocket успешно переподключен!");
        setTimeout(updatePlaytimeOnPage, 1000); // Даем 0.5 сек для установления соединения
    };

    eel._websocket.onerror = function (error) {
        console.error("Ошибка при переподключении WebSocket:", error);
    };

    eel._websocket.onclose = function () {
        console.warn(
            "WebSocket снова закрылся. Повторная попытка через 3 секунды..."
        );
        setTimeout(reconnectEel, 3000); // Пробуем снова через 3 секунды
    };
}

// Делаем функцию доступной в Python через Eel
eel.expose(updatePlaytimeOnPage);

// Экспонированные функции для Python
eel.expose(updateProgressDownloadLauncher);

// Проверка актуальности лаунчера
function checkLauncher() {
    eel.check_version_launcher()(function (isUpToDate) {
        console.log(isUpToDate);
        if (isUpToDate) {
            console.log("Открываем");
            showUpdateModal();
        }
        console.log("Не открываем");
    });
}

// Показать модальное окно для обновления лаунчера
function showUpdateModal() {
    const modal = document.getElementById("updateModal");
    modal.style.display = "block";

    const updateButton = document.getElementById("updateButton");
    const laterButton = document.getElementById("laterButton");

    updateButton.addEventListener("click", () => {
        // modal.style.display = "none";
        // updateLauncher();
        try {
            eel.downolad_launcher_version();
            window.close();
        } catch (error) {
            console.error("Ошибка при обновлении:", error);
            closeUpdateModalCircular();
            showErrorMessage();
        }
    });

    laterButton.addEventListener("click", function () {
        modal.style.display = "none";
    });
}

function showUpdateModalCircular() {
    const modal = document.getElementById("updateModalCircular");
    modal.style.display = "flex"; // Показываем модальное окно
}

// Закрытие модального окна с прогрессом
function closeUpdateModalCircular() {
    const modal = document.getElementById("updateModalCircular");
    modal.style.display = "none"; // Скрываем модальное окно
}

// Обновление лаунчера
// async function updateLauncher() {
//     try {
//         await eel.downolad_launcher_version()();
//         window.close();
//     } catch (error) {
//         console.error("Ошибка при обновлении:", error);
//         closeUpdateModalCircular();
//         showErrorMessage();
//     }
// }

// eel.expose(close_window);
// function close_window() {
//     window.close();
// }

// Обновление прогресс-бара
function updateProgressDownloadLauncher(progress) {
    const progressBar = document.querySelector(
        ".circular-progress-update .progress-update"
    );
    const progressTextUpdate = document.querySelector(".progress-text-update");
    console.log("Обновление прогресса:", progress); // Отладочный вывод
    const validPercent = Math.min(progress, 100);
    const dashoffset = 433 - (433 * validPercent) / 100;
    progressBar.style.strokeDashoffset = dashoffset;
    progressTextUpdate.textContent = `${Math.round(validPercent)}%`;
}

// Показать успешное обновление
function showSuccessMessage() {
    const successModal = document.getElementById("successModal");
    successModal.style.display = "flex";

    const closeButton = document.getElementById("closeSuccessModal");
    closeButton.addEventListener("click", function () {
        successModal.style.display = "none";
        setTimeout(() => {
            console.log("После задержки");
            window.close();
        }, 3000);
    });
}

// Показать ошибку обновления
function showErrorMessage() {
    const errorModal = document.getElementById("errorModal");
    errorModal.style.display = "flex";

    const closeButton = document.getElementById("closeErrorModal");
    closeButton.addEventListener("click", function () {
        errorModal.style.display = "none";
    });
}

// Добавляем обработчик события при загрузке страницы
document.addEventListener("DOMContentLoaded", () => {
    checkLauncher();
});

// Функция для обновления статуса процесса
function send_process_status(status) {
    console.log(status);
}

// Экспонируем функцию для Python
eel.expose(send_process_status);

// document.addEventListener('contextmenu', (e) => {
//   e.preventDefault();
// });