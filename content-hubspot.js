(() => {
  "use strict";

  if (!/^app(-[a-z0-9]+)?\.hubspot\.com$/i.test(location.hostname)) return;

  const {
    ATTR,
    CHIP_ATTR,
    EMAIL_RE,
    EMAIL_FIND_RE,
    parseEmail,
    normalizePersonName,
    linkedInSearchUrl,
    createLink,
    extensionAlive,
    removeIconsIn,
    appEnabled,
    startSiteAdapter,
  } = globalThis.CLI;

  const CARD_ATTR = "data-cli-hubspot-card";
  const META_RE =
    /^(email|phone|mobile|last contacted|contacts|actions|filters|sort|note|call|task|meetings?|more|view all|primary point|contact with primary)/i;

  function emailFromMailto(href) {
    if (!href) return "";
    try {
      const raw = decodeURIComponent(String(href).replace(/^mailto:/i, "").split("?")[0]).trim();
      return EMAIL_RE.test(raw.toLowerCase()) ? raw.toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function emailFromText(text) {
    const m = String(text || "").match(EMAIL_FIND_RE);
    if (!m) return "";
    const email = m[0].toLowerCase();
    return EMAIL_RE.test(email) ? email : "";
  }

  function personName(raw) {
    const name = normalizePersonName(raw);
    if (!name || name.includes("@")) return "";
    const words = name.split(/\s+/);
    if (words.length < 2 || words.length > 4) return "";
    if (META_RE.test(name)) return "";
    return name;
  }

  function companyFromAtLine(line) {
    const m = String(line || "").match(/\bat\s+(.+)$/i);
    if (!m) return "";
    const company = m[1].replace(/\s*[|•·].*$/, "").trim().replace(/\s+/g, " ");
    if (!company || company.length < 2 || company.length > 60 || company.includes("@")) return "";
    if (personName(company)) return "";
    return company;
  }

  function looksLikeCompanyOnly(line) {
    const t = String(line || "").trim();
    if (!t || t.length > 50 || t.includes("@") || /\bat\b/i.test(t)) return "";
    if (META_RE.test(t) || personName(t)) return "";
    if (!/^[A-Za-z0-9]/.test(t)) return "";
    // Single brand token or short brand phrase, not a sentence.
    if (t.split(/\s+/).length > 4) return "";
    return t;
  }

  /** Structured fields from a contact card's visible text. */
  function parseCardFields(card) {
    const lines = String(card?.innerText || "")
      .split(/\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let name = "";
    let company = "";
    let email = "";

    for (const line of lines) {
      if (META_RE.test(line) && !/^email\s*:/i.test(line)) continue;

      const em =
        emailFromText(line.replace(/^email\s*:\s*/i, "")) ||
        (/^email\s*:/i.test(line) ? emailFromText(line) : "");
      if (em) {
        if (!email) email = em;
        continue;
      }

      const fromAt = companyFromAtLine(line);
      if (fromAt) {
        if (!company) company = fromAt;
        continue;
      }

      const maybeName = personName(line);
      if (maybeName) {
        if (!name) name = maybeName;
        continue;
      }

      const onlyCompany = looksLikeCompanyOnly(line);
      if (onlyCompany && name && !company) {
        company = onlyCompany;
      }
    }

    return { name, company, email, lines };
  }

  function buildHubSpotQuery(fields, emailInfo) {
    const name = fields.name || emailInfo?.name || "";
    const company = fields.company || emailInfo?.company || "";
    // Always "Name Company" — never job title, never bare email local-part if we have a name.
    return [name, company].filter(Boolean).join(" ").trim();
  }

  function collectEmailNodes(root) {
    const found = [];
    const seen = new WeakSet();

    root.querySelectorAll?.('a[href^="mailto:"]').forEach((a) => {
      const email = emailFromMailto(a.getAttribute("href"));
      if (!email || seen.has(a)) return;
      seen.add(a);
      found.push({ email, el: a });
    });

    const walkers = root.querySelectorAll?.("a, span, div, p, td, li, button") || [];
    for (const el of walkers) {
      if (seen.has(el) || el.closest?.(`a[${ATTR}]`)) continue;
      if ((el.children?.length || 0) > 3) continue;

      const text = (el.innerText || el.textContent || "").trim();
      if (!text || text.length > 100 || !text.includes("@")) continue;
      if ((el.innerText || "").length > 140) continue;

      const email = emailFromText(text.replace(/^email\s*:\s*/i, ""));
      if (!email) continue;

      seen.add(el);
      found.push({ email, el });
    }

    return found;
  }

  function scoreCard(el, email) {
    if (!el) return -1;
    const text = el.innerText || "";
    if (text.length < 12 || text.length > 800) return -1;
    if (!text.toLowerCase().includes(email)) return -1;

    // Preview chrome: "< Contacts" + Actions
    const head = text.trim().slice(0, 30);
    if (/^contacts\b/i.test(head) && /actions/i.test(text)) return -1;

    const fields = parseCardFields(el);
    if (!fields.name) return -1; // Must include the person name

    let score = 5;
    if (fields.email === email || text.toLowerCase().includes(email)) score += 3;
    if (fields.company) score += 2;
    if (/email\s*:/i.test(text)) score += 2;
    if (/last contacted/i.test(text)) score += 1;
    score += Math.max(0, 6 - Math.floor(text.length / 120));
    return score;
  }

  function findCardRoot(emailEl, email) {
    let best = null;
    let bestScore = 0;
    let node = emailEl;

    for (let i = 0; i < 16 && node && node !== document.body; i++) {
      const score = scoreCard(node, email);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
      node = node.parentElement;
    }

    return bestScore >= 5 ? best : null;
  }

  /**
   * Insert the icon immediately after the text node that is the contact name.
   * This keeps placement consistent across list + detail layouts.
   */
  function placeAfterNameText(card, personName, link) {
    if (!card || !personName) return false;
    const target = personName.toLowerCase();

    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node?.textContent) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest?.(`a[${ATTR}]`)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const raw = node.textContent.replace(/\s+/g, " ").trim();
      if (!raw) continue;
      if (raw.toLowerCase() !== target) continue;

      const parent = node.parentElement;
      if (!parent) continue;
      // Avoid header / nav labels mistakenly equal to a name (rare).
      if (parent.closest?.("nav, header")) continue;

      if (node.nextSibling) parent.insertBefore(link, node.nextSibling);
      else parent.appendChild(link);
      return true;
    }

    // Fallback: deepest element whose trimmed text equals the name.
    let best = null;
    for (const el of card.querySelectorAll("a, span, div, p, h1, h2, h3, h4, strong, button")) {
      if (el.closest?.(`a[${ATTR}]`)) continue;
      const t = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (t.toLowerCase() !== target) continue;
      if (!best || best.contains(el)) best = el;
    }
    if (best) {
      best.appendChild(link);
      return true;
    }

    return false;
  }

  function ensureIcon(card, email, emailEl) {
    if (!appEnabled("hubspot") || !card || !email) return;
    if (!extensionAlive()) return;

    const info = parseEmail(email);
    if (!info) return;

    const fields = parseCardFields(card);
    if (!fields.name) return;

    const company = fields.company || info.company || "";
    const query = buildHubSpotQuery(
      { name: fields.name, company },
      info
    );
    if (!query || !fields.name) return;

    // Require Name + Company when we can derive a company; still allow name-only.
    const existing = [...card.querySelectorAll(`a[${ATTR}]`)].find(
      (a) => a.dataset.cliEmail === email
    );
    const extId = chrome.runtime.id;
    if (
      existing &&
      existing.dataset.cliExt === extId &&
      existing.dataset.cliQuery === query &&
      existing.isConnected
    ) {
      card.setAttribute(CARD_ATTR, email);
      card.setAttribute(CHIP_ATTR, email);
      return;
    }

    removeIconsIn(card);

    const payload = {
      name: fields.name,
      company,
      email,
      query,
      url: linkedInSearchUrl(query),
    };

    const link = createLink(payload);
    link.classList.add("cli-linkedin-link--hubspot");
    try {
      if (placeAfterNameText(card, fields.name, link)) {
        card.setAttribute(CARD_ATTR, email);
        card.setAttribute(CHIP_ATTR, email);
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
    if (!appEnabled("hubspot")) {
      document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.remove());
      return;
    }

    const byEmail = new Map();

    for (const { email, el } of collectEmailNodes(root)) {
      const card = findCardRoot(el, email);
      if (!card) continue;

      const score = scoreCard(card, email);
      const prev = byEmail.get(email);
      if (!prev || score > prev.score) {
        byEmail.set(email, { card, emailEl: el, score });
      }
    }

    for (const [email, { card, emailEl, score }] of byEmail.entries()) {
      if (score < 5) continue;
      ensureIcon(card, email, emailEl);
    }

    root.querySelectorAll?.(`a[${ATTR}]`).forEach((a) => {
      const host = a.closest(`[${CARD_ATTR}]`) || a.parentElement;
      const email = a.dataset.cliEmail || "";
      if (!host || !email || !(host.innerText || "").toLowerCase().includes(email)) {
        a.remove();
      }
    });
  }

  startSiteAdapter({
    appId: "hubspot",
    scanFn: scan,
    attributeFilter: ["href", "aria-label"],
  });
})();
