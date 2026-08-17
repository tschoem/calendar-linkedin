# Calendar LinkedIn Lookup

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source Chrome extension that adds a LinkedIn icon next to guests on **Google Calendar**. Clicking the icon searches LinkedIn for that person’s name and company.

## Features

- Detects Calendar guests from hovercard data (`data-hovercard-id`) even when the email isn’t shown
- Builds a people search from **display name + company** (company from the email domain)
- Opens results in a **side panel embed** or a **new tab** (configurable)
- Can be fully disabled from the extension popup

## Install (unpacked)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project folder
6. Open [Google Calendar](https://calendar.google.com) and open an event with guests

After reloading the extension, refresh any open Calendar tabs so the content script picks up changes.

```bash
git clone https://github.com/tschoem/calendar-linkedin.git
cd calendar-linkedin
```

## Usage

1. Open an event in Google Calendar
2. Look for the LinkedIn icon beside each guest
3. Click it to search LinkedIn for that contact

Example: guest **Doe, Jane** with `jane.doe@acme.com` → search **“Jane Doe Acme”**.

## Settings

Click the extension icon in the toolbar:

| Setting | Description |
| --- | --- |
| **Enable extension** | Master switch for icons |
| **Side panel with embed** | Open LinkedIn search in Chrome’s side panel |
| **New tab** | Open LinkedIn search in a new browser tab |

Side panel and new tab are mutually exclusive (radio options).

## Permissions

- `storage` — save settings
- `sidePanel` — open LinkedIn beside Calendar
- `scripting` — inject into already-open Calendar tabs after install/reload
- Host access to `calendar.google.com` and `linkedin.com`

## Project layout

```
manifest.json      Extension manifest (MV3)
background.js      Service worker (side panel + injection)
content.js         Calendar page script (icons + click handling)
settings.js        Shared settings helpers
popup.html/js/css  Toolbar settings UI
sidepanel.html/js/css  Side panel LinkedIn embed
styles.css         Icon styles on Calendar
icons/             Extension icons
LICENSE            MIT license
```

## Notes

- LinkedIn may ask you to sign in inside the side panel embed (third-party cookies / framing limits).
- Calendar’s DOM changes often; if icons are missing, refresh the Calendar tab or reload the extension.
- This extension does not use the LinkedIn API and does not scrape profiles — it only opens LinkedIn’s people search.
- Not affiliated with Google or LinkedIn.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first so we can align on approach.

## License

This project is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Thomas Schoemaecker.
