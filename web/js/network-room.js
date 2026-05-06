/* ==========================================================================
   SLauncher · Network Room redesign · controller
   Replaces the old `initNetworkPanel` IIFE (which built the panel inline in
   JS). This version:
     - reads from the static HTML partial
     - renders rich peer cards with ping bars, IP:PORT copy, host badge
     - shows my own public IP + lets me publish my LAN port to the room
     - drives the connection status pill at the top
   ========================================================================== */
(function () {
    "use strict";

    /* ------------------------------------------------------------------ */
    /* Helpers                                                            */
    /* ------------------------------------------------------------------ */

    const $ = (id) => document.getElementById(id);

    function safeToast(payload) {
        if (typeof window.toast === "function") window.toast(payload);
    }

    function setText(el, text) {
        if (el) el.textContent = text;
    }

    function setStatus(line, message, tone) {
        if (!line) return;
        line.textContent = message;
        if (tone) line.dataset.tone = tone;
        else delete line.dataset.tone;
    }

    function setPill(pill, state, text) {
        if (!pill) return;
        pill.dataset.state = state;
        const t = pill.querySelector(".net-status-text");
        if (t) t.textContent = text;
    }

    function pingQuality(ms) {
        const v = Number(ms);
        if (!Number.isFinite(v) || v < 0) return "dead";
        if (v <= 80) return "great";
        if (v <= 160) return "good";
        if (v <= 260) return "bad";
        return "dead";
    }
    function pingLabel(q) {
        return q === "great"
            ? "Отлично"
            : q === "good"
              ? "Норм"
              : q === "bad"
                ? "Плохо"
                : "Нет связи";
    }
    function pingBarsCount(q) {
        return q === "great" ? 3 : q === "good" ? 2 : q === "bad" ? 1 : 0;
    }

    function initials(name) {
        if (!name) return "?";
        const parts = String(name).trim().split(/\s+/);
        const a = parts[0]?.[0] || "";
        const b = parts[1]?.[0] || parts[0]?.[1] || "";
        return (a + b).toUpperCase();
    }

    function copyToClipboard(text) {
        if (!text) return Promise.resolve(false);
        if (navigator.clipboard?.writeText) {
            return navigator.clipboard
                .writeText(text)
                .then(() => true)
                .catch(() => false);
        }
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            return Promise.resolve(true);
        } catch {
            return Promise.resolve(false);
        }
    }

    async function eelCall(name, ...args) {
        try {
            const fn = window.eel?.[name];
            if (typeof fn !== "function") return null;
            return await fn(...args)();
        } catch (e) {
            console.warn(`[network-room] eel.${name} failed`, e);
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* State                                                              */
    /* ------------------------------------------------------------------ */

    const state = {
        myIp: "",
        myPort: "",
        myUserId: "",
        currentRoomId: "",
        joined: false,
        autoRefreshTimer: null,
        preferLanRoute: false,
    };

    /* ------------------------------------------------------------------ */
    /* Rendering                                                          */
    /* ------------------------------------------------------------------ */

    function renderPeers(peers) {
        const list = $("network-peers");
        if (!list) return;
        if (!Array.isArray(peers) || peers.length === 0) {
            list.innerHTML = "";
            return;
        }
        list.innerHTML = peers
            .map((p) => {
                const nick = p?.nickname || p?.name || p?.user_id || "Unknown";
                const userId = p?.user_id || p?.id || "";
                const ping = p?.ping_ms ?? p?.ping;
                const ip = p?.public_ip || p?.ip || p?.address || "—";
                const lanIp = p?.lan_ip || "";
                const port = p?.minecraft_port || p?.port || p?.lan_port || "";
                const isHost = !!(p?.is_host || p?.host);
                const isMe =
                    userId && state.myUserId && userId === state.myUserId;

                const quality = pingQuality(ping);
                const pingTxt = Number.isFinite(Number(ping))
                    ? `${ping} ms`
                    : "—";
                const bars = pingBarsCount(quality);
                const barsHtml = `
                <span class="ping-bars">
                    <span style="opacity:${bars >= 1 ? 1 : 0.25}"></span>
                    <span style="opacity:${bars >= 2 ? 1 : 0.25}"></span>
                    <span style="opacity:${bars >= 3 ? 1 : 0.25}"></span>
                </span>`;

                const tags = [];
                if (isHost)
                    tags.push(
                        `<span class="net-peer-tag tag-host">Host</span>`,
                    );
                if (isMe)
                    tags.push(`<span class="net-peer-tag tag-me">Вы</span>`);

                const preferredIp = state.preferLanRoute && lanIp ? lanIp : ip;
                const ipPort = port ? `${preferredIp}:${port}` : preferredIp;
                const canConnect = !!port && preferredIp && preferredIp !== "—";

                return `
                <article class="net-peer-card ${isMe ? "is-me" : ""} ${isHost ? "is-host" : ""}">
                    <div class="net-peer-top">
                        <span class="net-peer-avatar">${initials(nick)}</span>
                        <div class="net-peer-name">
                            <span class="net-peer-nick">${escapeHtml(nick)}</span>
                            <div class="net-peer-tags">${tags.join("") || `<span class="net-peer-tag">Peer</span>`}</div>
                        </div>
                        <span class="net-peer-ping" data-quality="${quality}" title="${pingLabel(quality)}">
                            ${barsHtml}
                            <span>${pingTxt}</span>
                        </span>
                    </div>
                    <div class="net-peer-body">
                        <div class="net-peer-row">
                            <span class="label">IP</span>
                            <span class="value ${ip === "—" ? "muted" : ""}">${escapeHtml(ip)}</span>
                            <button class="net-copy-btn" data-copy="${escapeAttr(ip)}" title="Скопировать IP">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="net-peer-row">
                            <span class="label">Порт</span>
                            <span class="value ${port ? "" : "muted"}">${port || "не опубликован"}</span>
                            <button class="net-copy-btn" data-copy="${escapeAttr(port || "")}" title="Скопировать порт"
                                    ${port ? "" : "disabled"}>
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div class="net-peer-actions">
                        <button class="net-btn net-btn-primary" data-copy="${escapeAttr(ipPort)}"
                                ${canConnect ? "" : "disabled"}>
                            <i class="fas fa-plug"></i> Скопировать маршрут
                        </button>
                    </div>
                </article>
            `;
            })
            .join("");

        // wire up copy buttons inside the list
        list.querySelectorAll("[data-copy]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const text = btn.getAttribute("data-copy");
                if (!text) return;
                const ok = await copyToClipboard(text);
                safeToast({
                    title: "Сеть",
                    message: ok
                        ? `Скопировано: ${text}`
                        : "Не удалось скопировать",
                    type: ok ? "success" : "error",
                });
            });
        });
    }

    function escapeHtml(s) {
        return String(s ?? "").replace(
            /[&<>"']/g,
            (m) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                })[m],
        );
    }
    function escapeAttr(s) {
        return escapeHtml(s).replace(/`/g, "&#96;");
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                            */
    /* ------------------------------------------------------------------ */

    async function loadConfig() {
        const cfg = await eelCall("get_network_config");
        if (!cfg) return;
        if ($("network-backend-url"))
            $("network-backend-url").value = cfg.backend_url || "";
        if ($("network-room-id"))
            $("network-room-id").value = cfg.active_room || "";
        if ($("network-nickname"))
            $("network-nickname").value = cfg.nickname || "";
        state.myUserId = cfg.user_id || cfg.client_id || "";
        if (cfg.active_room) {
            state.currentRoomId = cfg.active_room;
            updatePill("connected", `Комната: ${cfg.active_room}`);
        }
    }

    async function loadMyLanIp() {
        const res = await eelCall("get_my_lan_ip");
        if (res?.ok && res.ip) setText($("net-my-lan-ip"), res.ip);
    }

    async function loadMyIp() {
        // Optional eel method — if absent, we just leave a dash.
        const res = await eelCall("get_my_public_ip");
        if (res?.ok && res.ip) {
            state.myIp = res.ip;
            setText($("net-my-ip"), res.ip);
        } else if (typeof res === "string" && res) {
            state.myIp = res;
            setText($("net-my-ip"), res);
        }
    }

    function updatePill(status, message) {
        const pill = $("net-status-pill");
        if (!pill) return;
        if (status === "connected")
            setPill(pill, "connected", message || "В комнате");
        else if (status === "error")
            setPill(pill, "error", message || "Ошибка");
        else setPill(pill, "idle", message || "Не подключено");
    }

    async function refreshPeers() {
        const room = $("network-room-id")?.value.trim();
        const status = $("network-status");
        if (!room) {
            setStatus(status, "Укажите имя комнаты", "error");
            return;
        }
        setStatus(status, "Обновление списка участников...", "working");
        const res = await eelCall("get_network_peers", room);
        if (!res?.ok) {
            setStatus(
                status,
                `Ошибка: ${res?.error || "не удалось получить список"}`,
                "error",
            );
            renderPeers([]);
            return;
        }
        const peers = res.peers || [];
        renderPeers(peers);
        setStatus(
            status,
            `Комната «${res.room_id}» — ${peers.length} участ.`,
            "success",
        );
    }

    async function saveSettings() {
        const status = $("network-status");
        const cfg = await eelCall(
            "save_network_config",
            $("network-backend-url")?.value.trim() || "",
            $("network-nickname")?.value.trim() || "",
            $("network-room-id")?.value.trim() || "",
        );
        setStatus(status, "Настройки сохранены", "success");
        safeToast({
            title: "Сеть",
            message: "Настройки сохранены",
            type: "success",
        });
        return cfg;
    }

    async function createRoom() {
        const status = $("network-status");
        await saveSettings();
        const room = $("network-room-id")?.value.trim();
        const password = $("network-room-password")?.value.trim();
        const nick = $("network-nickname")?.value.trim();
        if (!room) {
            setStatus(status, "Имя комнаты не может быть пустым", "error");
            return;
        }
        setStatus(status, "Создание комнаты...", "working");
        const res = await eelCall("create_network_room", room, password, nick);
        if (!res?.ok) {
            setStatus(
                status,
                `Ошибка создания: ${res?.error || "unknown"}`,
                "error",
            );
            updatePill("error", "Ошибка");
            return;
        }
        state.currentRoomId = res.room_id || room;
        if ($("network-room-id"))
            $("network-room-id").value = state.currentRoomId;
        state.joined = true;
        updatePill("connected", `Комната: ${state.currentRoomId}`);
        setStatus(
            status,
            `Комната «${state.currentRoomId}» создана. Ты — хост.`,
            "success",
        );
        safeToast({
            title: "Сеть",
            message: "Комната создана",
            type: "success",
        });
        await refreshPeers();
        startAutoRefresh();
    }

    async function joinRoom() {
        const status = $("network-status");
        await saveSettings();
        const room = $("network-room-id")?.value.trim();
        const password = $("network-room-password")?.value.trim();
        const nick = $("network-nickname")?.value.trim();
        if (!room) {
            setStatus(status, "Имя комнаты не может быть пустым", "error");
            return;
        }
        setStatus(status, "Подключение к комнате...", "working");
        const res = await eelCall("join_network_room", room, password, nick);
        if (!res?.ok) {
            setStatus(
                status,
                `Ошибка подключения: ${res?.error || "unknown"}`,
                "error",
            );
            updatePill("error", "Ошибка");
            return;
        }
        state.currentRoomId = res.room_id || room;
        if ($("network-room-id"))
            $("network-room-id").value = state.currentRoomId;
        state.joined = true;
        updatePill("connected", `Комната: ${state.currentRoomId}`);
        setStatus(
            status,
            `Подключено к «${state.currentRoomId}». Список участников ниже.`,
            "success",
        );
        safeToast({
            title: "Сеть",
            message: "Подключение выполнено",
            type: "success",
        });
        await refreshPeers();
        startAutoRefresh();
    }

    async function publishPort() {
        const status = $("network-status");
        const port = Number($("net-my-port")?.value || 0);
        if (!port || port < 1 || port > 65535) {
            setStatus(status, "Введите корректный порт (1-65535)", "error");
            return;
        }
        if (!state.currentRoomId) {
            setStatus(
                status,
                "Сначала создай или подключись к комнате",
                "error",
            );
            return;
        }
        setStatus(status, `Публикуем порт ${port} в комнате...`, "working");
        const res = await eelCall(
            "set_local_minecraft_port",
            state.currentRoomId,
            port,
        );
        if (!res?.ok) {
            setStatus(
                status,
                `Ошибка публикации: ${res?.error || "метод не реализован"}`,
                "error",
            );
            return;
        }
        state.myPort = port;
        setStatus(
            status,
            `Порт ${port} опубликован. Участники увидят твой IP:${port}.`,
            "success",
        );
        safeToast({
            title: "Сеть",
            message: `Порт ${port} опубликован`,
            type: "success",
        });
        await refreshPeers();
    }

    async function checkExternalPort() {
        const statusEl = $("net-port-check-status");
        const ip = $("net-my-ip")?.textContent?.trim();
        const port = Number($("net-my-port")?.value || state.myPort || 0);
        if (!ip || ip === "—") {
            if (statusEl) {
                statusEl.textContent = "сначала получи public IP";
                statusEl.dataset.state = "warn";
            }
            return;
        }
        if (!port) {
            if (statusEl) {
                statusEl.textContent = "введи порт";
                statusEl.dataset.state = "warn";
            }
            return;
        }
        if (statusEl) {
            statusEl.textContent = "проверка...";
            statusEl.dataset.state = "warn";
        }
        const res = await eelCall("check_external_port", ip, port);
        if (!res?.ok) {
            if (statusEl) {
                statusEl.textContent = "ошибка проверки";
                statusEl.dataset.state = "warn";
            }
            return;
        }
        if (statusEl) {
            statusEl.textContent = res.is_open ? "да" : "нет";
            statusEl.dataset.state = res.is_open ? "ok" : "fail";
        }

        if (res.is_open) {
            state.preferLanRoute = false;
            setStatus(
                $("network-status"),
                `Порт ${port} открыт извне: direct-подключение должно работать.`,
                "success",
            );
        } else {
            state.preferLanRoute = true;
            setStatus(
                $("network-status"),
                `Похоже CGNAT/порт закрыт — включён VPN-режим маршрута (LAN/VPN IP).`,
                "error",
            );
            safeToast({
                title: "Сеть",
                message: "Авто-переключение на VPN/LAN маршрут включено",
                type: "info",
            });
        }
    }

    async function testConnection() {
        const status = $("network-status");
        if (!state.currentRoomId) {
            setStatus(
                status,
                "Сначала создай или подключись к комнате",
                "error",
            );
            return;
        }
        setStatus(status, "Проверка маршрута до хоста...", "working");
        const res = await eelCall("test_room_connection", state.currentRoomId);
        if (!res?.ok) {
            setStatus(
                status,
                `Ошибка проверки: ${res?.error || "unknown"}`,
                "error",
            );
            return;
        }
        if (res.reachable) {
            setStatus(
                status,
                `Готово: ${res.endpoint?.address || "хост"} доступен. Можно копировать IP:порт и заходить в Minecraft.`,
                "success",
            );
        } else {
            setStatus(
                status,
                `Нет TCP пути до ${res.endpoint?.address || "хоста"}. Нужен VPN/туннель/relay.`,
                "error",
            );
        }
    }

    async function autoRoute() {
        const status = $("network-status");
        if (!state.currentRoomId) {
            setStatus(
                status,
                "Сначала создай или подключись к комнате",
                "error",
            );
            return;
        }
        setStatus(status, "Подбираем оптимальный маршрут...", "working");
        const res = await eelCall("get_connection_plan", state.currentRoomId);
        if (!res?.ok) {
            setStatus(
                status,
                `Нет маршрута: ${res?.error || "unknown"}`,
                "error",
            );
            return;
        }
        if (res.mode === "direct") {
            setStatus(
                status,
                `Direct: хост ${res.endpoint?.address || ""} доступен напрямую.`,
                "success",
            );
        } else {
            const turnCount = (res.turn?.urls || []).length;
            setStatus(
                status,
                `Relay: direct недоступен, использую TURN (${turnCount} серв.)`,
                "working",
            );
        }
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        state.autoRefreshTimer = setInterval(() => {
            if (state.joined && state.currentRoomId) refreshPeers();
        }, 8000);
    }
    function stopAutoRefresh() {
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Wire up                                                            */
    /* ------------------------------------------------------------------ */

    function bind() {
        $("network-save-btn")?.addEventListener("click", saveSettings);
        $("network-create-btn")?.addEventListener("click", createRoom);
        $("network-join-btn")?.addEventListener("click", joinRoom);
        $("network-refresh-btn")?.addEventListener("click", refreshPeers);
        $("network-connect-btn")?.addEventListener("click", testConnection);
        $("network-auto-btn")?.addEventListener("click", autoRoute);
        $("net-check-port")?.addEventListener("click", checkExternalPort);
        $("net-publish-port")?.addEventListener("click", publishPort);

        // Copy buttons in the "my status" card
        document
            .querySelectorAll(".net-copy-btn[data-copy-target]")
            .forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const targetId = btn.getAttribute("data-copy-target");
                    const value = $(targetId)?.textContent?.trim() || "";
                    if (!value || value === "—") {
                        safeToast({
                            title: "Сеть",
                            message: "Нечего копировать",
                            type: "warn",
                        });
                        return;
                    }
                    const ok = await copyToClipboard(value);
                    safeToast({
                        title: "Сеть",
                        message: ok
                            ? `Скопировано: ${value}`
                            : "Не удалось скопировать",
                        type: ok ? "success" : "error",
                    });
                });
            });
    }

    async function init() {
        if (!$("network-room-panel")) return;
        bind();
        await loadConfig();
        await loadMyIp();
        await loadMyLanIp();
        // Pre-render empty list so the empty-state styling shows
        renderPeers([]);
        if (state.currentRoomId) {
            await refreshPeers();
            startAutoRefresh();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
