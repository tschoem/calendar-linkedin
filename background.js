importScripts("settings.js");

const CALENDAR_URLS = ["https://calendar.google.com/*"];
const LINKEDIN_WINDOW_KEY = "cliLinkedInWindowId";
const CALENDAR_RESTORE_KEY = "cliCalendarRestore";

const SIDE_WIDTH = 440;
const SIDE_GAP = 8;
const MIN_CALENDAR_WIDTH = 640;

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
  await injectIntoOpenCalendarTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  initExtension();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoOpenCalendarTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.startsWith("https://calendar.google.com/")) return;
  injectIntoTab(tabId);
});

async function resolveAnchorWindow(anchorWindowId) {
  if (anchorWindowId != null) {
    try {
      return await chrome.windows.get(anchorWindowId);
    } catch (_) {}
  }

  const calendarTabs = await chrome.tabs.query({
    url: CALENDAR_URLS,
    active: true,
  });
  if (calendarTabs[0]?.windowId != null) {
    try {
      return await chrome.windows.get(calendarTabs[0].windowId);
    } catch (_) {}
  }

  try {
    return await chrome.windows.getLastFocused();
  } catch (_) {
    return null;
  }
}

/**
 * Shrink Calendar to free a strip on the right, then return bounds for the
 * LinkedIn popup. Original Calendar size is restored when that popup closes.
 * Coordinates are not clamped — secondary displays often use negative origins.
 */
async function layoutBesideCalendar(anchor) {
  const fallback = {
    left: 80,
    top: 40,
    width: SIDE_WIDTH,
    height: 900,
  };
  if (!anchor?.id) return fallback;

  const session = await chrome.storage.session.get(CALENDAR_RESTORE_KEY);
  let restore = session[CALENDAR_RESTORE_KEY];

  if (!restore || restore.windowId !== anchor.id) {
    restore = {
      windowId: anchor.id,
      left: anchor.left ?? 0,
      top: anchor.top ?? 0,
      width: anchor.width ?? 1200,
      height: anchor.height ?? 900,
      state: anchor.state || "normal",
    };
    await chrome.storage.session.set({ [CALENDAR_RESTORE_KEY]: restore });
  }

  const sideTotal = SIDE_WIDTH + SIDE_GAP;
  const newCalWidth = Math.max(MIN_CALENDAR_WIDTH, restore.width - sideTotal);
  const freed = restore.width - newCalWidth;

  if (freed >= 120) {
    try {
      await chrome.windows.update(anchor.id, {
        state: "normal",
        left: restore.left,
        top: restore.top,
        width: newCalWidth,
        height: restore.height,
      });
    } catch (err) {
      console.debug("[CLI] resize calendar", err);
    }

    return {
      left: restore.left + newCalWidth + SIDE_GAP,
      top: restore.top,
      width: SIDE_WIDTH,
      height: Math.max(700, restore.height - 40),
    };
  }

  // Calendar already too narrow — overlay the right edge instead of shrinking.
  return {
    left: (anchor.left || 0) + Math.max(0, (anchor.width || 1200) - SIDE_WIDTH - SIDE_GAP),
    top: (anchor.top || 0) + 24,
    width: SIDE_WIDTH,
    height: Math.max(700, (anchor.height || 900) - 40),
  };
}

async function restoreCalendarWindow() {
  const stored = await chrome.storage.session.get(CALENDAR_RESTORE_KEY);
  const restore = stored[CALENDAR_RESTORE_KEY];
  if (!restore?.windowId) return;

  try {
    if (restore.state === "maximized" || restore.state === "fullscreen") {
      await chrome.windows.update(restore.windowId, { state: restore.state });
    } else {
      await chrome.windows.update(restore.windowId, {
        state: "normal",
        left: restore.left,
        top: restore.top,
        width: restore.width,
        height: restore.height,
      });
    }
  } catch (_) {}

  await chrome.storage.session.remove(CALENDAR_RESTORE_KEY);
}

async function openOrFocusLinkedInWindow(url, anchorWindowId) {
  let bounds = { left: 80, top: 40, width: SIDE_WIDTH, height: 900 };

  try {
    const anchor = await resolveAnchorWindow(anchorWindowId);
    bounds = await layoutBesideCalendar(anchor);
  } catch (err) {
    console.debug("[CLI] layout", err);
  }

  const stored = await chrome.storage.session.get(LINKEDIN_WINDOW_KEY);
  const existingId = stored[LINKEDIN_WINDOW_KEY];

  if (existingId) {
    try {
      const win = await chrome.windows.get(existingId);
      if (win?.id) {
        await chrome.windows.update(win.id, {
          focused: true,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        });
        const tabs = await chrome.tabs.query({ windowId: win.id });
        if (tabs[0]?.id) await chrome.tabs.update(tabs[0].id, { url });
        return { ok: true, mode: "reuse" };
      }
    } catch (_) {}
  }

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: bounds.width,
    height: bounds.height,
    left: bounds.left,
    top: bounds.top,
    focused: true,
  });

  if (win?.id) await chrome.storage.session.set({ [LINKEDIN_WINDOW_KEY]: win.id });
  return { ok: true, mode: "create" };
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const stored = await chrome.storage.session.get(LINKEDIN_WINDOW_KEY);
  if (stored[LINKEDIN_WINDOW_KEY] === windowId) {
    await chrome.storage.session.remove(LINKEDIN_WINDOW_KEY);
    await restoreCalendarWindow();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "cli-open-linkedin-window") {
    if (!message.url) {
      sendResponse({ ok: false, error: "Missing url" });
      return false;
    }
    openOrFocusLinkedInWindow(message.url, sender.tab?.windowId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
