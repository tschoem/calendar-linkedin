(() => {
  if (globalThis.__cliSettingsLoaded) return;
  globalThis.__cliSettingsLoaded = true;

  const CLI_DEFAULTS = {
    enabled: true,
    clickTarget: "sidePanel", // "sidePanel" | "newTab"
  };

  function cliCoerceBool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value == null) return fallback;
    return Boolean(value);
  }

  function cliNormalizeClickTarget(raw) {
    if (raw?.clickTarget === "newTab" || raw?.clickTarget === "sidePanel") {
      return raw.clickTarget;
    }
    // Migrate legacy boolean pair
    if (cliCoerceBool(raw?.openInNewTab, false) && !cliCoerceBool(raw?.openInSidePanel, true)) {
      return "newTab";
    }
    return "sidePanel";
  }

  function cliNormalizeSettings(raw) {
    const merged = { ...(raw || {}) };
    return {
      enabled: cliCoerceBool(merged.enabled, true),
      clickTarget: cliNormalizeClickTarget(merged),
    };
  }

  function cliGetSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(null, (items) => {
          if (chrome.runtime.lastError) {
            resolve({ ...CLI_DEFAULTS });
            return;
          }
          resolve(cliNormalizeSettings({ ...CLI_DEFAULTS, ...items }));
        });
      } catch (_) {
        resolve({ ...CLI_DEFAULTS });
      }
    });
  }

  function cliSaveSettings(partial) {
    const next = cliNormalizeSettings({ ...CLI_DEFAULTS, ...partial });
    return new Promise((resolve) => {
      chrome.storage.sync.set(next, () => resolve(next));
    });
  }

  // Expose for content/popup scripts (shared extension world).
  globalThis.CLI_DEFAULTS = CLI_DEFAULTS;
  globalThis.cliNormalizeSettings = cliNormalizeSettings;
  globalThis.cliGetSettings = cliGetSettings;
  globalThis.cliSaveSettings = cliSaveSettings;

  if (typeof window !== "undefined") {
    window.CLI_DEFAULTS = CLI_DEFAULTS;
    window.cliNormalizeSettings = cliNormalizeSettings;
    window.cliGetSettings = cliGetSettings;
    window.cliSaveSettings = cliSaveSettings;
  }
})();
