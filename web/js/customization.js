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

    const DEFAULT_COLORS = {
        "theme-bg": "#0e1018",
        "theme-panel": "#161826",
        "theme-text": "#e6e8f0",
        "theme-accent": "#ffb86c",
        "theme-accent2": "#ff9a3c",
    };

    /* Curated presets — keep <= 5 colors per palette, no purple-heavy mixes */
    const PRESETS = [
        {
            id: "stone-default",
            name: "Stone Default",
            sub: "Тёплый янтарь",
            colors: {
                "theme-bg": "#0e1018",
                "theme-panel": "#161826",
                "theme-text": "#e6e8f0",
                "theme-accent": "#ffb86c",
                "theme-accent2": "#ff9a3c",
            },
        },
        {
            id: "midnight",
            name: "Midnight",
            sub: "Холодный синий",
            colors: {
                "theme-bg": "#0a0e1a",
                "theme-panel": "#121828",
                "theme-text": "#dfe7ff",
                "theme-accent": "#5aa8ff",
                "theme-accent2": "#3d7ad6",
            },
        },
        {
            id: "forest",
            name: "Forest",
            sub: "Зелёная глубина",
            colors: {
                "theme-bg": "#0c1410",
                "theme-panel": "#142019",
                "theme-text": "#e3f1e5",
                "theme-accent": "#5fd07a",
                "theme-accent2": "#3aa756",
            },
        },
        {
            id: "cherry",
            name: "Cherry",
            sub: "Тёплая вишня",
            colors: {
                "theme-bg": "#120e0f",
                "theme-panel": "#1d1517",
                "theme-text": "#f3e6e6",
                "theme-accent": "#ff7a8a",
                "theme-accent2": "#d94d63",
            },
        },
        {
            id: "sand",
            name: "Sand",
            sub: "Светлая пустыня",
            colors: {
                "theme-bg": "#1a1612",
                "theme-panel": "#241f18",
                "theme-text": "#f1e9d8",
                "theme-accent": "#e8c46a",
                "theme-accent2": "#c79a3c",
            },
        },
        {
            id: "carbon",
            name: "Carbon",
            sub: "Чисто графит",
            colors: {
                "theme-bg": "#0c0c0e",
                "theme-panel": "#17171b",
                "theme-text": "#e8eaee",
                "theme-accent": "#bdbdbd",
                "theme-accent2": "#7d7d7d",
            },
        },
    ];

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

    function applyPreset(preset) {
        Object.entries(preset.colors).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.value = value;
            // Trigger existing main.js listeners (applyThemePreview)
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        syncAllSwatches();
    }

    function markActivePreset() {
        const current = COLOR_KEYS.reduce((acc, k) => {
            const el = document.getElementById(k);
            acc[k] = (el?.value || "").toLowerCase();
            return acc;
        }, {});
        $$(".cust-preset-card").forEach((card) => {
            const id = card.dataset.presetId;
            const preset = PRESETS.find((p) => p.id === id);
            if (!preset) return;
            const matches = Object.entries(preset.colors).every(
                ([k, v]) => current[k] === v.toLowerCase(),
            );
            card.classList.toggle("active", matches);
        });
    }

    function renderPresets() {
        const host = $("#cust-presets");
        if (!host) return;
        host.innerHTML = PRESETS.map((p) => {
            const stripStops = COLOR_KEYS.map(
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
            };

            colorInput.addEventListener("input", syncCard);
            alphaInput?.addEventListener("input", syncCard);
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
