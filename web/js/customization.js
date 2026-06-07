/* ==========================================================================
   StoneLauncher · Customization redesign · enhancement layer
   Load AFTER main.js: <script src="js/customization.js"></script>
   It only ADDS:
     - color preset gallery
     - live swatch + hex sync next to each color picker
     - reset-to-defaults button
     - rerender of saved themes as cards (replaces simple list)
   It does NOT touch existing applyThemePreview() / saveActiveThemeToBackend().
   ========================================================================== */
(function () {
    "use strict";

    const COLOR_KEYS = [
        "theme-bg",
        "theme-panel",
        "theme-text",
        "theme-accent",
        "theme-accent2",
    ];

    const DEFAULT_COLORS = buildPalette({
        bg: "#0e1018",
        bg2: "#11131e",
        bgDeep: "#0b0d15",
        panel: "#161826",
        panel2: "#1c1f30",
        panelHover: "#232740",
        text: "#e6e8f0",
        textMuted: "#8b90a8",
        textDim: "#5a607a",
        accent: "#ffb86c",
        accent2: "#ff9a3c",
        info: "#4fc3f7",
        success: "#4ade80",
        danger: "#f87171",
        warm: ["#2c1810", "#4a2818", "#6b3a1c"],
        cool: ["#1a2a3e", "#244266", "#2e5b8a"],
        arcane: ["#2e1a3e", "#4a2466", "#6b3a8a"],
        nature: ["#1a3e2a", "#246644", "#2e8a5b"],
    });

    const PRESET_STRIP_KEYS = [
        "theme-bg",
        "theme-panel",
        "theme-text",
        "theme-accent",
        "theme-accent2",
        "theme-info",
        "theme-success",
        "theme-danger",
    ];

    /* Curated presets. Each preset now carries the full advanced palette:
       base surfaces, muted text, semantic colors, translucent accent/status
       layers, glass surfaces, shadows, and preview gradients. */
    const PRESETS = [
        {
            id: "stone-default",
            name: "Stone Default",
            sub: "Тёплый янтарь",
            colors: DEFAULT_COLORS,
        },
        {
            id: "midnight",
            name: "Midnight",
            sub: "Холодный синий",
            colors: buildPalette({
                bg: "#0a0e1a",
                bg2: "#0f1728",
                bgDeep: "#070a12",
                panel: "#121828",
                panel2: "#18223a",
                panelHover: "#223152",
                text: "#dfe7ff",
                textMuted: "#8da4cf",
                textDim: "#536988",
                accent: "#5aa8ff",
                accent2: "#3d7ad6",
                info: "#65d8ff",
                success: "#5ee6a8",
                danger: "#ff6f91",
                warm: ["#1b2338", "#26385c", "#35548a"],
                cool: ["#0e2542", "#123c6a", "#1f5f9e"],
                arcane: ["#152348", "#233b78", "#3158ad"],
                nature: ["#12342d", "#1a574d", "#267c70"],
            }),
        },
        {
            id: "forest",
            name: "Forest",
            sub: "Зелёная глубина",
            colors: buildPalette({
                bg: "#0c1410",
                bg2: "#111d16",
                bgDeep: "#07100c",
                panel: "#142019",
                panel2: "#1b2c22",
                panelHover: "#253c2e",
                text: "#e3f1e5",
                textMuted: "#94ad9b",
                textDim: "#5d7564",
                accent: "#5fd07a",
                accent2: "#3aa756",
                info: "#62d6c4",
                success: "#76e28c",
                danger: "#f07f68",
                warm: ["#1d2b16", "#31451d", "#4d6428"],
                cool: ["#12362f", "#1b5b4e", "#2b8372"],
                arcane: ["#193326", "#28543d", "#3a7856"],
                nature: ["#123b22", "#1d6434", "#2d914b"],
            }),
        },
        {
            id: "cherry",
            name: "Cherry",
            sub: "Тёплая вишня",
            colors: buildPalette({
                bg: "#120e0f",
                bg2: "#1a1215",
                bgDeep: "#0d0809",
                panel: "#1d1517",
                panel2: "#2b1b20",
                panelHover: "#3d2530",
                text: "#f3e6e6",
                textMuted: "#c09aa0",
                textDim: "#805f68",
                accent: "#ff7a8a",
                accent2: "#d94d63",
                info: "#ff9bb5",
                success: "#f0b35d",
                danger: "#ff5f73",
                warm: ["#351319", "#571d28", "#852c3d"],
                cool: ["#2a1827", "#46243f", "#6b355f"],
                arcane: ["#3c1730", "#63214c", "#8f3270"],
                nature: ["#2b2416", "#4c3b20", "#725c2d"],
            }),
        },
        {
            id: "sand",
            name: "Sand",
            sub: "Светлая пустыня",
            colors: buildPalette({
                bg: "#1a1612",
                bg2: "#221d16",
                bgDeep: "#120f0b",
                panel: "#241f18",
                panel2: "#332b1e",
                panelHover: "#463927",
                text: "#f1e9d8",
                textMuted: "#c4b08a",
                textDim: "#86734f",
                accent: "#e8c46a",
                accent2: "#c79a3c",
                info: "#8ed0c0",
                success: "#b8d76a",
                danger: "#e89062",
                warm: ["#3b2815", "#614320", "#8c612d"],
                cool: ["#22312c", "#35564e", "#4d7a70"],
                arcane: ["#3c2d1c", "#654821", "#927036"],
                nature: ["#2d3518", "#4e5d24", "#728535"],
            }),
        },
        {
            id: "carbon",
            name: "Carbon",
            sub: "Чисто графит",
            colors: buildPalette({
                bg: "#0c0c0e",
                bg2: "#111114",
                bgDeep: "#070708",
                panel: "#17171b",
                panel2: "#202026",
                panelHover: "#2b2b33",
                text: "#e8eaee",
                textMuted: "#a2a6ad",
                textDim: "#676b72",
                accent: "#bdbdbd",
                accent2: "#7d7d7d",
                info: "#9fc4d8",
                success: "#9ed0a9",
                danger: "#d99a9a",
                warm: ["#24211d", "#38332d", "#504a42"],
                cool: ["#1d252b", "#2e3b45", "#455966"],
                arcane: ["#24222b", "#393544", "#514d62"],
                nature: ["#202820", "#323f34", "#4a5c4d"],
            }),
        },
    ];

    function hexToRgb(hex) {
        const normalized = String(hex || "")
            .replace("#", "")
            .trim();
        if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 0, g: 0, b: 0 };
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16),
        };
    }

    function rgba(hex, alpha) {
        const { r, g, b } = hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function luminance(hex) {
        const { r, g, b } = hexToRgb(hex);
        const channel = (value) => {
            const srgb = value / 255;
            return srgb <= 0.03928
                ? srgb / 12.92
                : Math.pow((srgb + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    function buildPalette(p) {
        const onAccent =
            p.onAccent || (luminance(p.accent) > 0.5 ? p.bgDeep : p.text);
        const onSuccess =
            p.onSuccess || (luminance(p.success) > 0.5 ? p.bgDeep : p.text);
        return {
            "theme-bg": p.bg,
            "theme-bg-2": p.bg2,
            "theme-bg-deep": p.bgDeep,
            "theme-panel": p.panel,
            "theme-panel-2": p.panel2,
            "theme-panel-hover": p.panelHover,
            "theme-text": p.text,
            "theme-text-muted": p.textMuted,
            "theme-text-dim": p.textDim,
            "theme-accent": p.accent,
            "theme-accent2": p.accent2,
            "theme-info": p.info,
            "theme-success": p.success,
            "theme-danger": p.danger,
            "theme-on-accent": onAccent,
            "theme-on-success": onSuccess,
            "theme-white-06": rgba(p.text, 0.06),
            "theme-white-08": rgba(p.text, 0.08),
            "theme-white-10": rgba(p.text, 0.1),
            "theme-white-12": rgba(p.text, 0.12),
            "theme-white-15": rgba(p.text, 0.15),
            "theme-white-16": rgba(p.text, 0.16),
            "theme-white-85": rgba(p.text, 0.85),
            "theme-accent-soft": rgba(p.accent, 0.12),
            "theme-accent-glow": rgba(p.accent, 0.3),
            "theme-accent-glow-strong": rgba(p.accent, 0.35),
            "theme-accent-glow-soft": rgba(p.accent, 0.25),
            "theme-accent-border": rgba(p.accent, 0.2),
            "theme-accent-focus": rgba(p.accent, 0.15),
            "theme-accent-bg-soft": rgba(p.accent, 0.08),
            "theme-accent-bg": rgba(p.accent, 0.12),
            "theme-accent-bg-hover": rgba(p.accent, 0.1),
            "theme-accent-bg-subtle": rgba(p.accent, 0.05),
            "theme-accent-glow-max": rgba(p.accent, 0.45),
            "theme-info-bg-soft": rgba(p.info, 0.12),
            "theme-info-bg": rgba(p.info, 0.08),
            "theme-info-bg-subtle": rgba(p.info, 0.04),
            "theme-success-bg-soft": rgba(p.success, 0.12),
            "theme-success-bg-strong": rgba(p.success, 0.9),
            "theme-success-border": rgba(p.success, 0.2),
            "theme-danger-bg-soft": rgba(p.danger, 0.08),
            "theme-danger-bg": rgba(p.danger, 0.12),
            "theme-danger-bg-hover": rgba(p.danger, 0.1),
            "theme-danger-border": rgba(p.danger, 0.2),
            "theme-overlay": "rgba(0, 0, 0, 0.6)",
            "theme-overlay-strong": "rgba(0, 0, 0, 0.7)",
            "theme-overlay-soft": "rgba(0, 0, 0, 0.5)",
            "theme-black-fade": "rgba(0, 0, 0, 0.1)",
            "theme-panel-glass": rgba(p.bg2, 0.7),
            "theme-panel-glass-strong": rgba(p.bg2, 0.85),
            "theme-panel-solid-soft": rgba(p.panel, 0.95),
            "theme-bg-solid-soft": rgba(p.bg, 0.95),
            "theme-shadow-text": "rgba(0, 0, 0, 0.4)",
            "theme-panel-mid-alpha": rgba(p.panel2, 0.6),
            "theme-preview-grad-warm-1": p.warm[0],
            "theme-preview-grad-warm-2": p.warm[1],
            "theme-preview-grad-warm-3": p.warm[2],
            "theme-preview-grad-cool-1": p.cool[0],
            "theme-preview-grad-cool-2": p.cool[1],
            "theme-preview-grad-cool-3": p.cool[2],
            "theme-preview-grad-arcane-1": p.arcane[0],
            "theme-preview-grad-arcane-2": p.arcane[1],
            "theme-preview-grad-arcane-3": p.arcane[2],
            "theme-preview-grad-nature-1": p.nature[0],
            "theme-preview-grad-nature-2": p.nature[1],
            "theme-preview-grad-nature-3": p.nature[2],
        };
    }

    function $(sel, root = document) {
        return root.querySelector(sel);
    }
    function $$(sel, root = document) {
        return Array.from(root.querySelectorAll(sel));
    }

    function setSwatch(key) {
        const input = document.getElementById(key);
        if (!input) return;
        const color = input.value || DEFAULT_COLORS[key];
        const swatch = document.querySelector(`[data-swatch-for="${key}"]`);
        const hex = document.querySelector(`[data-hex-for="${key}"]`);
        if (swatch) swatch.style.background = color;
        if (hex) hex.textContent = color.toUpperCase();
    }

    function syncAllSwatches() {
        COLOR_KEYS.forEach(setSwatch);
        markActivePreset();
    }

    function parseRgba(value) {
        const match = String(value || "").match(
            /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i,
        );
        if (!match) return null;
        const toHex = (channel) =>
            Number(channel).toString(16).padStart(2, "0");
        return {
            hex: `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`,
            alpha: match[4] ?? "1",
        };
    }

    function setThemeInput(id, value) {
        const input = document.getElementById(id);
        if (!input) return;

        const rgbaParts = parseRgba(value);
        const colorInput = document.getElementById(`${id}-color`);
        const alphaInput = document.getElementById(`${id}-alpha`);
        const alphaValue = document.getElementById(`${id}-alpha-value`);
        if (rgbaParts && colorInput && alphaInput) {
            colorInput.value = rgbaParts.hex;
            alphaInput.value = rgbaParts.alpha;
            if (alphaValue) alphaValue.textContent = rgbaParts.alpha;
            colorInput.dispatchEvent(new Event("input", { bubbles: true }));
            alphaInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        input.value = value;
        // Trigger existing main.js listeners (applyThemePreview)
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function applyPreset(preset) {
        Object.entries(preset.colors).forEach(([id, value]) => {
            setThemeInput(id, value);
        });
        syncAllSwatches();
        enhanceAdvancedGrid();
    }

    function markActivePreset() {
        $$(".cust-preset-card").forEach((card) => {
            const id = card.dataset.presetId;
            const preset = PRESETS.find((p) => p.id === id);
            if (!preset) return;
            const matches = Object.entries(preset.colors).every(([k, v]) => {
                const el = document.getElementById(k);
                return !el || (el.value || "").toLowerCase() === v.toLowerCase();
            });
            card.classList.toggle("active", matches);
        });
    }

    function renderPresets() {
        const host = $("#cust-presets");
        if (!host) return;
        host.innerHTML = PRESETS.map((p) => {
            const stripStops = PRESET_STRIP_KEYS.map(
                (k) => `<span style="background:${p.colors[k]}"></span>`,
            ).join("");
            return `
                <div class="cust-preset-card" data-preset-id="${p.id}" tabindex="0" role="button">
                    <div class="cust-preset-strip">${stripStops}</div>
                    <div class="cust-preset-name">${p.name}</div>
                    <div class="cust-preset-sub">${p.sub}</div>
                </div>
            `;
        }).join("");

        $$(".cust-preset-card", host).forEach((card) => {
            const onActivate = () => {
                const preset = PRESETS.find(
                    (p) => p.id === card.dataset.presetId,
                );
                if (preset) applyPreset(preset);
            };
            card.addEventListener("click", onActivate);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate();
                }
            });
        });
    }

    /* Replace simple saved-themes list with rich cards.
       The original main.js fills #saved-themes-list with whatever it wants;
       we observe it and re-skin its children into card markup.
       This way both the legacy code and the redesign live together. */
    function rerenderSavedThemes() {
        const host = $("#saved-themes-list");
        if (!host) return;
        if (!host.dataset.skinned) host.classList.add("cust-saved-list");
        host.dataset.skinned = "1";
        // Find legacy items and skin them
        $$(".saved-theme-item", host).forEach((row) => skinLegacyRow(row));
    }

    function skinLegacyRow(row) {
        if (row.dataset.skinned) return;
        row.dataset.skinned = "1";
        // Try to read theme name and colors from inline attributes if present.
        const name =
            row.querySelector("[data-name]")?.dataset.name ||
            row.querySelector(".saved-theme-name")?.textContent ||
            row.firstChild?.textContent?.trim() ||
            "Тема";

        const datasetKeyForColor = (key) =>
            key
                .replace(/^theme-/, "theme-")
                .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

        const colors = {};
        COLOR_KEYS.forEach((k) => {
            const v = row.dataset[datasetKeyForColor(k)];
            if (v) colors[k] = v;
        });
        const stops = COLOR_KEYS.map(
            (k) =>
                `<span style="background:${colors[k] || DEFAULT_COLORS[k]}"></span>`,
        ).join("");

        // Move existing buttons (Apply/Delete from legacy code) into our actions slot.
        const legacyButtons = Array.from(row.querySelectorAll("button"));
        const card = document.createElement("div");
        card.className = "cust-saved-card";
        if (row.dataset.themeId) card.dataset.themeId = row.dataset.themeId;
        card.innerHTML = `
            <div class="cust-saved-strip">${stops}</div>
            <div class="cust-saved-name"></div>
            <div class="cust-saved-actions"></div>
        `;
        card.querySelector(".cust-saved-name").textContent = name;
        const actions = card.querySelector(".cust-saved-actions");
        legacyButtons.forEach((btn) => {
            const isDelete =
                btn.classList.contains("delete-theme-btn") ||
                /удал/i.test(btn.textContent);
            const isShare =
                btn.classList.contains("share-theme-btn") ||
                /подел/i.test(btn.textContent);
            btn.classList.add(
                isDelete
                    ? "cust-delete-btn"
                    : isShare
                      ? "cust-share-btn"
                      : "cust-apply-btn",
            );
            actions.appendChild(btn);
        });

        row.replaceWith(card);
    }

    function enhanceAdvancedGrid() {
        const grid = document.getElementById("theme-advanced-grid");
        if (!grid) return;

        Array.from(grid.querySelectorAll(":scope > label")).forEach((label) => {
            if (label.classList.contains("cust-adv-card")) return;

            const directColorInput = label.querySelector(
                ':scope > input[type="color"]',
            );
            const rgbaEditor = label.querySelector(":scope > .rgba-editor");
            const rgbaColorInput = rgbaEditor?.querySelector(
                'input[type="color"]',
            );
            const hiddenInput = rgbaEditor?.querySelector(
                'input[type="hidden"]',
            );
            const alphaInput = rgbaEditor?.querySelector('input[type="range"]');
            const alphaValue = rgbaEditor?.querySelector("span");
            const colorInput = directColorInput || rgbaColorInput;
            if (!colorInput) return;

            const labelTextNode = Array.from(label.childNodes).find(
                (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
            );
            const title =
                labelTextNode?.textContent?.trim() ||
                label.dataset.label ||
                "Цвет";

            label.classList.add("cust-adv-card");
            if (rgbaEditor) label.classList.add("has-rgba");

            const swatch = document.createElement("span");
            swatch.className = "cust-adv-swatch";
            const meta = document.createElement("span");
            meta.className = "cust-adv-meta";
            const text = document.createElement("span");
            text.className = "cust-adv-label";
            text.textContent = title;
            const hex = document.createElement("span");
            hex.className = "cust-adv-hex";
            meta.append(text, hex);

            label.insertBefore(swatch, label.firstChild);
            label.insertBefore(meta, swatch.nextSibling);

            if (labelTextNode) labelTextNode.textContent = "";

            const syncCard = () => {
                const color = (colorInput.value || "").toUpperCase();
                const alpha = alphaInput ? Number(alphaInput.value || 1) : null;
                swatch.style.setProperty(
                    "--swatch-color",
                    alpha == null
                        ? color
                        : `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${alpha})`,
                );
                hex.textContent =
                    alpha == null ? color : `${color} · A:${alpha.toFixed(2)}`;
                if (alphaValue) alphaValue.textContent = String(alpha);
                if (hiddenInput && alpha != null) {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    hiddenInput.value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                markActivePreset();
            };

            colorInput.addEventListener("input", syncCard);
            alphaInput?.addEventListener("input", syncCard);
            hiddenInput?.addEventListener("input", syncCard);
            syncCard();
        });
    }

    function bind() {
        // Sync swatches whenever any color picker changes
        COLOR_KEYS.forEach((key) => {
            const input = document.getElementById(key);
            if (!input) return;
            input.addEventListener("input", () => setSwatch(key));
            input.addEventListener("change", markActivePreset);
        });

        // Reset button
        $("#cust-reset-defaults")?.addEventListener("click", () => {
            applyPreset({ colors: DEFAULT_COLORS });
        });

        Object.keys(DEFAULT_COLORS).forEach((key) => {
            const input = document.getElementById(key);
            input?.addEventListener("change", markActivePreset);
        });

        // Watch saved themes container for changes by legacy code
        const advancedHost = $("#theme-advanced-grid");
        if (advancedHost) {
            const mo2 = new MutationObserver(() => enhanceAdvancedGrid());
            mo2.observe(advancedHost, { childList: true, subtree: true });
            enhanceAdvancedGrid();
        }

        const savedHost = $("#saved-themes-list");
        if (savedHost) {
            const mo = new MutationObserver(() => rerenderSavedThemes());
            mo.observe(savedHost, { childList: true, subtree: true });
            rerenderSavedThemes();
        }
    }

    function init() {
        if (!document.querySelector('[data-settings-pane="customization"]'))
            return;
        renderPresets();
        syncAllSwatches();
        bind();
        enhanceAdvancedGrid();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
