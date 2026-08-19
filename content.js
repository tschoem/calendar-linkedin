(() => {
  "use strict";

  if (globalThis.__cliLinkedInInit) {
    globalThis.__cliLinkedInRescan?.();
    return;
  }
  globalThis.__cliLinkedInInit = true;

  const ATTR = "data-cli-linkedin";
  const CHIP_ATTR = "data-cli-chip";
  const EMAIL_RE =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const EMAIL_FIND_RE =
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/;
  const NOISE_WORDS =
    /\b(organizer|guest|optional|accepted|declined|needs action|yes|no|maybe|home|office|edit|working location|out of office)\b/gi;

  const GENERIC_MAILBOXES = new Set([
    "info",
    "contact",
    "hello",
    "support",
    "admin",
    "sales",
    "team",
    "noreply",
    "no-reply",
    "mail",
    "office",
    "help",
    "billing",
    "hr",
    "jobs",
    "careers",
  ]);

  const LINKEDIN_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  `.trim();

  let settings =
    typeof cliNormalizeSettings === "function" && typeof CLI_DEFAULTS !== "undefined"
      ? cliNormalizeSettings(CLI_DEFAULTS)
      : { enabled: true, clickTarget: "sidePanel" };

  function titleCase(parts) {
    return parts
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }

  function companyFromDomain(domain) {
    if (!domain) return "";
    const host = domain.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".");
    const skip = new Set([
      "com",
      "org",
      "net",
      "io",
      "co",
      "ai",
      "app",
      "dev",
      "edu",
      "gov",
      "uk",
      "us",
      "fr",
      "de",
      "es",
      "it",
      "nl",
      "be",
      "ca",
      "au",
      "jp",
      "in",
    ]);
    const brand = labels.find((l) => !skip.has(l)) || labels[0];
    if (
      !brand ||
      ["gmail", "googlemail", "outlook", "hotmail", "yahoo", "icloud", "me", "live", "msn"].includes(
        brand
      )
    ) {
      return "";
    }
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  }

  function nameFromLocalPart(local) {
    if (!local) return "";
    const cleaned = local
      .split("+")[0]
      .replace(/\d+$/g, "")
      .replace(/[._-]+/g, " ")
      .trim();
    if (!cleaned) return "";
    const firstToken = cleaned.split(/\s+/)[0].toLowerCase();
    if (GENERIC_MAILBOXES.has(firstToken) || GENERIC_MAILBOXES.has(cleaned.toLowerCase())) {
      return "";
    }
    const parts = cleaned.split(/\s+/).filter((p) => p.length > 1 || /[A-Za-z]/.test(p));
    if (parts.length === 0) return "";
    if (parts.length >= 3) return titleCase([parts[0], parts[parts.length - 1]]);
    return titleCase(parts);
  }

  function parseEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) return null;
    const at = normalized.lastIndexOf("@");
    return {
      email: normalized,
      name: nameFromLocalPart(normalized.slice(0, at)),
      company: companyFromDomain(normalized.slice(at + 1)),
    };
  }

  function normalizePersonName(raw) {
    if (!raw) return "";
    let name = String(raw)
      .replace(EMAIL_FIND_RE, "")
      .replace(NOISE_WORDS, " ")
      .replace(/[<>()[\]|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (name.includes(",")) {
      const [last, ...rest] = name
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (last && rest.length) name = `${rest.join(" ")} ${last}`.replace(/\s+/g, " ").trim();
    }

    // Keep at most first + last (+ optional middle) — never a whole guest list.
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length > 4) name = words.slice(0, 3).join(" ");
    if (!name || name.length < 2 || name.includes("@")) return "";
    if (/^(organizer|guest|home|office|edit)$/i.test(name)) return "";
    return name;
  }

  function linkedInSearchUrl(query) {
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  }

  function featuresActive() {
    return Boolean(settings.enabled);
  }

  function chipEmail(chip) {
    const raw =
      chip.getAttribute("data-hovercard-id") ||
      chip.getAttribute("data-email") ||
      "";
    const normalized = String(raw).trim().toLowerCase();
    return EMAIL_RE.test(normalized) ? normalized : "";
  }

  function extractName(chip, emailInfo) {
    // Strict: only read name nodes inside THIS chip.
    const selectors = [".SDqFWd > span", ".SDqFWd span", ".SDqFWd", ".ddPise > span"];
    for (const sel of selectors) {
      const node = chip.querySelector(sel);
      if (!node) continue;
      // Ignore if this node itself contains nested guest chips.
      if (node.querySelector?.("[data-hovercard-id], [data-email]")) continue;
      const name = normalizePersonName(node.textContent || "");
      if (name) return name;
    }

    // Visible email-only rows: no display name.
    if (emailInfo?.name) return emailInfo.name;
    return "";
  }

  function removeIconsIn(chip) {
    chip.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => a.remove());
    if (chip.nextElementSibling?.matches?.(`a[${ATTR}]`)) {
      chip.nextElementSibling.remove();
    }
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function openInNewTab(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) {}
  }

  function openLookup(payload) {
    const url = payload.url || linkedInSearchUrl(payload.query);
    if (!url) return;

    if (settings.clickTarget === "sidePanel") {
      if (!extensionAlive()) {
        openInNewTab(url);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "cli-open-linkedin-window", url }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            openInNewTab(url);
          }
        });
      } catch (_) {
        // Extension was reloaded — old content script is dead.
        openInNewTab(url);
      }
      return;
    }

    openInNewTab(url);
  }

  function createLink(payload) {
    const a = document.createElement("a");
    a.className = "cli-linkedin-link";
    a.href = payload.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = `Search LinkedIn for “${payload.query}”`;
    a.setAttribute("aria-label", a.title);
    a.setAttribute(ATTR, "1");
    a.dataset.cliEmail = payload.email || "";
    a.dataset.cliQuery = payload.query || "";
    a.dataset.cliExt = chrome.runtime?.id || "";
    a.innerHTML = LINKEDIN_SVG;

    a.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLookup({
          name: payload.name,
          company: payload.company,
          email: payload.email,
          query: payload.query,
          url: payload.url,
        });
      },
      true
    );
    return a;
  }

  function findNameAnchor(chip) {
    return (
      chip.querySelector(".SDqFWd") ||
      chip.querySelector(".ddPise") ||
      chip.querySelector(".CVKLNd") ||
      null
    );
  }

  // "Meet with…" / people-search pickers — never inject icons there.
  function isPeoplePickerContext(el) {
    if (!el) return true;

    const pickerRoot =
      el.closest('[role="listbox"], [role="dialog"], [role="menu"], [role="combobox"]') ||
      el.parentElement;
    if (!pickerRoot) return false;

    const probe = (pickerRoot.innerText || "").slice(0, 800);
    if (/meet with|search for people/i.test(probe)) return true;

    if (
      pickerRoot.querySelector?.(
        'input[placeholder*="Search for people" i], input[aria-label*="Search for people" i], input[placeholder*="Meet with" i]'
      )
    ) {
      return true;
    }

    // Options inside a listbox that sits under a people-search field.
    if (el.closest('[role="option"]')) {
      const scope =
        el.closest('[role="dialog"]') ||
        el.closest('[role="listbox"]')?.parentElement ||
        document.body;
      if (
        scope?.querySelector?.(
          'input[placeholder*="Search for people" i], input[aria-label*="Search for people" i]'
        )
      ) {
        return true;
      }
      if (/meet with|search for people/i.test((scope?.innerText || "").slice(0, 400))) {
        return true;
      }
    }

    return false;
  }

  function placeIcon(chip, link) {
    // Only place beside a real guest name row — never on avatars / search hits.
    const row = chip.querySelector(".ddPise");
    const name = chip.querySelector(".SDqFWd");

    if (row) {
      row.appendChild(link);
      return true;
    }
    if (name) {
      name.insertAdjacentElement("afterend", link);
      return true;
    }
    return false;
  }

  function ensureIcon(chip) {
    if (!featuresActive() || !chip) return;
    if (!extensionAlive()) return;

    if (isPeoplePickerContext(chip)) {
      removeIconsIn(chip);
      return;
    }

    const email = chipEmail(chip);
    if (!email) return;

    const info = parseEmail(email);
    if (!info) return;

    // Guest event rows have a name structure; skip unknown layouts.
    if (!findNameAnchor(chip)) {
      removeIconsIn(chip);
      return;
    }

    const existing = chip.querySelector(`a[${ATTR}]`);
    const extId = chrome.runtime.id;
    // Recreate icons from a previous extension load (stale click handlers).
    if (existing && existing.dataset.cliEmail === email && existing.dataset.cliExt === extId) {
      chip.setAttribute(CHIP_ATTR, email);
      return;
    }

    removeIconsIn(chip);

    const name = extractName(chip, info);
    const company = info.company;
    const query = [name || info.name || email.split("@")[0], company].filter(Boolean).join(" ");
    if (!query) return;

    const payload = {
      name: name || info.name || "",
      company,
      email,
      query,
      url: linkedInSearchUrl(query),
    };

    const link = createLink(payload);
    try {
      if (placeIcon(chip, link)) {
        chip.setAttribute(CHIP_ATTR, email);
      } else {
        link.remove();
      }
    } catch (_) {
      try {
        link.remove();
      } catch (__) {}
    }
  }

  function scan(root = document.body) {
    if (!root) return;
    if (!featuresActive()) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }

    // Strip any icons that landed in people-search / Meet with UI.
    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      if (isPeoplePickerContext(a)) a.remove();
    });

    // One chip = one [data-hovercard-id="email@…"] (or data-email).
    const chips = root.querySelectorAll?.(
      '[data-hovercard-id*="@"], [data-email*="@"]'
    );
    if (!chips) return;

    const seen = new Set();
    chips.forEach((el) => {
      if (isPeoplePickerContext(el)) {
        const bad = el.closest("[data-hovercard-id], [data-email]") || el;
        removeIconsIn(bad);
        return;
      }

      // Use the element that actually owns the email attribute.
      const email =
        (EMAIL_RE.test((el.getAttribute("data-hovercard-id") || "").toLowerCase()) &&
          el.getAttribute("data-hovercard-id").toLowerCase()) ||
        (EMAIL_RE.test((el.getAttribute("data-email") || "").toLowerCase()) &&
          el.getAttribute("data-email").toLowerCase()) ||
        "";
      if (!email || seen.has(email)) return;

      // Prefer outermost guest chip for this email attribute on itself.
      const chip =
        el.matches("[data-hovercard-id*='@'], [data-email*='@']") && chipEmail(el)
          ? el
          : el.closest("[data-hovercard-id*='@'], [data-email*='@']") || el;

      if (isPeoplePickerContext(chip)) {
        removeIconsIn(chip);
        return;
      }

      // Skip nested duplicates (child matching same email).
      const parentChip = chip.parentElement?.closest?.(
        "[data-hovercard-id*='@'], [data-email*='@']"
      );
      if (parentChip && chipEmail(parentChip) === email) return;

      seen.add(email);
      ensureIcon(chip);
    });

    // Remove orphan icons left over from Calendar DOM rebuilds.
    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      if (isPeoplePickerContext(a)) {
        a.remove();
        return;
      }
      const host = a.closest("[data-hovercard-id], [data-email]");
      if (!host) {
        a.remove();
        return;
      }
      if (isPeoplePickerContext(host) || !findNameAnchor(host)) {
        a.remove();
        return;
      }
      const email = chipEmail(host);
      if (!email || a.dataset.cliEmail !== email) a.remove();
    });
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan(document.body);
    });
  }

  globalThis.__cliLinkedInRescan = () => {
    document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
    document.querySelectorAll(`[${CHIP_ATTR}]`).forEach((el) => el.removeAttribute(CHIP_ATTR));
    scheduleScan();
  };

  function applySettings(next) {
    settings =
      typeof cliNormalizeSettings === "function"
        ? cliNormalizeSettings(next)
        : { ...settings, ...next };
    if (!featuresActive()) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }
    scheduleScan();
  }

  // Drop any icons left by a previous extension version before first scan.
  document.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => a.remove());
  document.querySelectorAll?.(`[${CHIP_ATTR}]`).forEach((el) => el.removeAttribute(CHIP_ATTR));

  const getSettings =
    typeof cliGetSettings === "function" ? cliGetSettings : () => Promise.resolve(settings);

  getSettings()
    .then((s) => {
      applySettings(s);
      scan(document.body);
    })
    .catch(() => {
      scan(document.body);
    });

  scan(document.body);

  let bursts = 0;
  const burstTimer = setInterval(() => {
    scheduleScan();
    bursts += 1;
    if (bursts >= 15) clearInterval(burstTimer);
  }, 600);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleScan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const next = { ...settings };
    const keys = typeof CLI_DEFAULTS !== "undefined" ? CLI_DEFAULTS : settings;
    for (const [key, change] of Object.entries(changes)) {
      if (key in keys) next[key] = change.newValue;
    }
    applySettings(next);
  });

  const observer = new MutationObserver(() => scheduleScan());
  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-email", "data-hovercard-id", "aria-label"],
    });
    scan(document.body);
  }

  if (document.body) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver);
})();
