(() => {
  if (globalThis.__cliSettingsLoaded) return;
  globalThis.__cliSettingsLoaded = true;

  const CLI_APP_IDS = ["calendar", "hubspot"];

  const CLI_DEFAULTS = {
    enabled: true,
    clickTarget: "sidePanel", // "sidePanel" | "newTab"
    apps: {
      calendar: true,
      hubspot: true,
    },
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

  function cliNormalizeApps(raw) {
    const incoming = raw?.apps && typeof raw.apps === "object" ? raw.apps : {};
    const apps = {};
    for (const id of CLI_APP_IDS) {
      apps[id] = cliCoerceBool(incoming[id], CLI_DEFAULTS.apps[id]);
    }
    return apps;
  }

  function cliNormalizeSettings(raw) {
    const merged = { ...(raw || {}) };
    return {
      enabled: cliCoerceBool(merged.enabled, true),
      clickTarget: cliNormalizeClickTarget(merged),
      apps: cliNormalizeApps(merged),
    };
  }

  function cliAppEnabled(settings, appId) {
    if (!settings?.enabled) return false;
    return Boolean(settings.apps?.[appId]);
  }

  function cliGetSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(null, (items) => {
          if (chrome.runtime.lastError) {
            resolve({ ...CLI_DEFAULTS, apps: { ...CLI_DEFAULTS.apps } });
            return;
          }
          resolve(cliNormalizeSettings({ ...CLI_DEFAULTS, ...items }));
        });
      } catch (_) {
        resolve({ ...CLI_DEFAULTS, apps: { ...CLI_DEFAULTS.apps } });
      }
    });
  }

  function cliSaveSettings(partial) {
    return cliGetSettings().then((current) => {
      const next = cliNormalizeSettings({
        ...current,
        ...partial,
        apps: {
          ...current.apps,
          ...(partial?.apps || {}),
        },
      });
      return new Promise((resolve) => {
        chrome.storage.sync.set(next, () => resolve(next));
      });
    });
  }

  globalThis.CLI_APP_IDS = CLI_APP_IDS;
  globalThis.CLI_DEFAULTS = CLI_DEFAULTS;
  globalThis.cliNormalizeSettings = cliNormalizeSettings;
  globalThis.cliAppEnabled = cliAppEnabled;
  globalThis.cliGetSettings = cliGetSettings;
  globalThis.cliSaveSettings = cliSaveSettings;

  if (typeof window !== "undefined") {
    window.CLI_APP_IDS = CLI_APP_IDS;
    window.CLI_DEFAULTS = CLI_DEFAULTS;
    window.cliNormalizeSettings = cliNormalizeSettings;
    window.cliAppEnabled = cliAppEnabled;
    window.cliGetSettings = cliGetSettings;
    window.cliSaveSettings = cliSaveSettings;
  }
})();
