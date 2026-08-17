importScripts("settings.js");

const FRAME_RULE_ID = 1;
const CALENDAR_URLS = ["https://calendar.google.com/*"];

async function ensureFrameRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [FRAME_RULE_ID],
      addRules: [
        {
          id: FRAME_RULE_ID,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "X-Frame-Options", operation: "remove" },
              { header: "Content-Security-Policy", operation: "remove" },
              { header: "Content-Security-Policy-Report-Only", operation: "remove" },
            ],
          },
          condition: {
            urlFilter: "||linkedin.com^",
            resourceTypes: ["sub_frame"],
          },
        },
      ],
    });
  } catch (err) {
    console.warn("[CLI] frame rules", err);
  }
}

async function injectIntoTab(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"],
    });
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["settings.js", "content.js"],
    });
  } catch (err) {
    console.debug("[CLI] inject", tabId, err);
  }
}

async function injectIntoOpenCalendarTabs() {
  const tabs = await chrome.tabs.query({ url: CALENDAR_URLS });
  await Promise.all(tabs.map((tab) => (tab.id ? injectIntoTab(tab.id) : null)));
}

async function initExtension() {
  try {
    const current = await chrome.storage.sync.get(CLI_DEFAULTS);
    await chrome.storage.sync.set(cliNormalizeSettings(current));
  } catch (_) {
    await chrome.storage.sync.set({ ...CLI_DEFAULTS });
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (_) {}
  await ensureFrameRules();
  await injectIntoOpenCalendarTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  initExtension();
});

chrome.runtime.onStartup.addListener(() => {
  ensureFrameRules();
  injectIntoOpenCalendarTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.startsWith("https://calendar.google.com/")) return;
  injectIntoTab(tabId);
});

function buildPayload(message) {
  return {
    name: message.payload?.name || "",
    company: message.payload?.company || "",
    email: message.payload?.email || "",
    query: message.payload?.query || "",
    url: message.payload?.url || "",
    openedAt: message.payload?.openedAt || Date.now(),
    requestId:
      message.payload?.requestId ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

async function notifySidePanel(payload) {
  // Direct push to an already-open side panel page.
  try {
    await chrome.runtime.sendMessage({
      type: "cli-side-panel-update",
      payload,
    });
  } catch (_) {
    // No listener yet (panel still opening) — panel will read storage on load.
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "cli-open-side-panel") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId || !windowId) {
      sendResponse({ ok: false, error: "No active tab" });
      return false;
    }

    const payload = buildPayload(message);

    // Must call open() in the gesture turn — ignore "already open" errors later.
    const openPromise = chrome.sidePanel.open({ windowId }).catch(() => null);

    (async () => {
      await ensureFrameRules();

      // Persist first so a remount/load can read the latest search.
      await chrome.storage.session.set({
        cliSidePanelPayload: payload,
        cliSidePanelTick: payload.requestId,
      });

      // Keep/restore our extension page in the side panel (LinkedIn may steal the frame).
      await chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true,
      });

      await openPromise;

      // Push update to an already-running panel instance.
      await notifySidePanel(payload);

      // Remount recovery: if the panel just reloaded via setOptions, give it a moment
      // then push again + ensure storage is readable.
      setTimeout(() => {
        notifySidePanel(payload);
      }, 150);

      sendResponse({ ok: true });
    })().catch((err) => {
      sendResponse({ ok: false, error: String(err?.message || err) });
    });

    return true;
  }

  if (message.type === "cli-get-side-panel-payload") {
    chrome.storage.session.get("cliSidePanelPayload").then((data) => {
      sendResponse({ ok: true, payload: data.cliSidePanelPayload || null });
    });
    return true;
  }

  // Side panel echoes / content ignores.
  if (message.type === "cli-side-panel-update") {
    return false;
  }

  return false;
});
