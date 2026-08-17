(() => {
  const empty = document.getElementById("empty");
  const frame = document.getElementById("frame");
  let lastRequestId = "";
  let loadTimer = null;

  function linkedInUrl(payload) {
    if (payload?.url) return payload.url;
    if (payload?.query) {
      return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        payload.query
      )}`;
    }
    return "";
  }

  function loadUrl(url) {
    clearTimeout(loadTimer);
    // Force iframe navigation every time (same LinkedIn path otherwise won't reload).
    frame.src = "about:blank";
    loadTimer = setTimeout(() => {
      frame.src = url;
    }, 50);
  }

  function render(payload, force) {
    if (!payload) return;

    const url = linkedInUrl(payload);
    if (!url) {
      document.body.classList.remove("loaded");
      empty.classList.remove("hidden");
      frame.classList.add("hidden");
      frame.src = "about:blank";
      return;
    }

    const requestId = String(payload.requestId || payload.openedAt || url);
    if (!force && requestId === lastRequestId) return;
    lastRequestId = requestId;

    document.body.classList.add("loaded");
    empty.classList.add("hidden");
    frame.classList.remove("hidden");
    loadUrl(url);
  }

  function fetchAndRender(force) {
    chrome.storage.session.get(["cliSidePanelPayload"], (data) => {
      if (chrome.runtime.lastError) return;
      render(data.cliSidePanelPayload || null, Boolean(force));
    });
  }

  // 1) Initial load
  fetchAndRender(true);

  // 2) Live updates while panel stays open
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cli-side-panel-update") {
      render(message.payload, true);
    }
  });

  // 3) Storage fallback
  chrome.storage.session.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    if (changes.cliSidePanelPayload?.newValue) {
      render(changes.cliSidePanelPayload.newValue, true);
      return;
    }
    if (changes.cliSidePanelTick) fetchAndRender(true);
  });

  // 4) If the panel was remounted or regained focus, resync
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fetchAndRender(true);
  });
  window.addEventListener("focus", () => fetchAndRender(true));
})();
