# Calendar LinkedIn Lookup

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source Chrome extension that adds a LinkedIn icon next to contacts in **Google Calendar** and **HubSpot**. Clicking the icon searches LinkedIn for that person’s name and company.

## Features

- **Google Calendar** — icons beside event guests (including hovercard emails)
- **HubSpot** — icons on contact list cards and contact detail views
- Builds a people search from **display name + company** (company from title “at …” or email domain)
- Opens results in a **side window** (resizes the host app) or a **new tab**
- Per-app toggles plus a master enable switch

## Install (unpacked)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project folder
6. Open [Google Calendar](https://calendar.google.com) or [HubSpot](https://app.hubspot.com) and view contacts

After reloading the extension, refresh any open Calendar / HubSpot tabs so the content script picks up changes.

```bash
git clone https://github.com/tschoem/calendar-linkedin.git
cd calendar-linkedin
```

## Usage

### Google Calendar

1. Open an event with guests
2. Click the LinkedIn icon beside a guest
3. LinkedIn people search opens for that contact

Example: guest **Doe, Jane** with `jane.doe@acme.com` → search **“Jane Doe Acme”**.

### HubSpot

1. Open a contacts list, association panel, or contact record
2. Click the LinkedIn icon beside the contact name
3. Search uses the contact name plus company from the “Title at Company” line when available

## Settings

Click the extension icon in the toolbar:

| Setting | Description |
| --- | --- |
| **Enable extension** | Master switch for icons |
| **Google Calendar** | Show icons on Calendar guests |
| **HubSpot** | Show icons on HubSpot contact cards |
| **Side window** | Resize the host app and open LinkedIn beside it |
| **New tab** | Open LinkedIn search in a new browser tab |

## Permissions

- `storage` — save settings
- `scripting` — inject into already-open tabs after install/reload
- Host access to `calendar.google.com` and `*.hubspot.com` (CRM app hosts only)

## Project layout

```
manifest.json           Extension manifest (MV3)
background.js           Service worker (side window + injection)
shared.js               Shared LinkedIn helpers
content-calendar.js     Google Calendar adapter
content-hubspot.js      HubSpot adapter
settings.js             Shared settings helpers
popup.html/js/css       Toolbar settings UI
styles.css              Icon styles
icons/                  Extension icons
LICENSE                 MIT license
```

## Notes

- LinkedIn opens in a dedicated side window or a new tab so actions like Connect work normally.
- Calendar and HubSpot DOM change often; if icons are missing, refresh the tab or reload the extension.
- This extension does not use the LinkedIn or HubSpot APIs and does not scrape profiles — it only opens LinkedIn’s people search from on-page name/email.
- Not affiliated with Google, HubSpot, or LinkedIn.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first so we can align on approach.

## License

This project is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Thomas Schoemaecker.
