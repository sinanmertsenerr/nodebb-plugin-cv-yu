# CV Builder for NodeBB (nodebb-plugin-cv-yu)

A privacy-first résumé editor that lives inside a NodeBB 4 forum at `/cv`. Built for [Yaşar Forum](https://yu.uniforum.app), usable by any forum.

- **Real A4 pages.** The preview measures every block and lays it out on true A4 pages, so the page count on screen is the page count in the PDF. Section headings never end up alone at the bottom of a page. When the CV runs past one page, the preview says so and marks where each page continues.
- **Print-ready PDF.** Printing uses the same pages at 210 × 297 mm with zero margins. The PDF is text, not an image, so it is searchable and ATS-friendly.
- **Four templates:** Clean (default), Harvard (black and white, serif, organisation in bold and role in italics), Sidebar (two columns; the side column comes after the main one in the PDF text so ATS read the name first) and Compact. Colours, three self-hosted typefaces (Inter, Source Sans 3, Source Serif 4 — all OFL), text size, line spacing, margins, heading style, contact icons and photo shape are adjustable.
- **Twelve sections** with drag-to-reorder (mouse, touch and keyboard), hiding and custom headings; entries reorder the same way. Bullet points grow as you type, Enter splits a bullet, Backspace at the start joins it to the previous one and pasting several lines makes one bullet per line. A photo is shrunk in the browser before it is stored.
- **Device-first storage.** Everything stays in the browser's local storage. Nothing reaches the server unless the person chooses *Store in my account* and gives explicit consent (the consent text names the server's country, as KVKK art. 9 requires). *Delete my data* wipes the server copy immediately; deleting the forum account deletes it too.
- **No analytics, no third-party requests.** Fonts come from the forum's own server. The workspace carries `data-clarity-mask`, and the page pauses Microsoft Clarity while it is open, so a forum-wide session recorder never sees CV content.
- **Light.** About 40 KB of script and 7 KB of CSS (gzip), preloaded from the page itself. Fonts are subset at build time (weights 400–700, Latin plus Turkish and other European letters): a Turkish CV in Inter downloads about 45 KB of font instead of 133 KB. Saving to the account waits for a 4-second pause, sends the photo only when it changed (it lives in its own hash, so a save never reads or rewrites it), and flushes pending changes when the tab is hidden or the page is left.
- **Starts from a sample CV.** A first visit opens a filled example named "Untitled CV"; printing, exporting or storing asks for a real name first, and the last CV can't be deleted.
- **Fill or improve with AI, no API key.** The *AI* button builds a prompt (rules plus the exact JSON format, generated from the data model) for the person to paste into ChatGPT, Claude or Gemini; pasting the answer back creates the CV. "Improve" sends the current CV without its photo and opens the result as a new CV. Nothing goes through the forum's server.
- **Fit on one page.** *Appearance* has a *Fit on one page* button: it tries tighter text size, line height, section spacing and margins on the hidden measuring page and keeps the loosest combination that fits (never below 8.25 pt text). The result is stored as fine-tune values, which also have their own sliders next to the Small/Medium/Large presets.
- **Import and export.** *Import* reads a CV from any JSON, whichever tool wrote it: this plugin's own file, NextCV, JSON Resume, Reactive Resume, a bare AI answer, or a layout it has never seen (`src/import.js` matches field names loosely, in English and Turkish, and converts dates, levels, HTML text and nested wrappers). It also takes an old CV as PDF/TXT. PDFs are read in the browser with pdf.js (loaded only when needed) and their text goes to the AI step. *Export* downloads JSON.
- **Turkish and English UI.** The CV language is separate: it sets headings, date formatting and the `lang` attribute (so uppercase headings get İ/ı right).

Requires NodeBB 4.15 or later.

## Installation

    npm install nodebb-plugin-cv-yu

Activate the plugin in the ACP, rebuild and restart. Then add `/cv` to the navigation (ACP → Settings → Navigation).

## How it loads

The app itself is not bundled into NodeBB's `nodebb.min.js`. The tiny `forum/cv` page module injects the hashed `cv.<hash>.js` and `.css` only on the `/cv` page. The plugin has no public static directory: its files (bundle, fonts, pdf.js) are served at `/cv-yu/app/<dir>/<file>` to signed-in users only (`401` for guests, `Cache-Control: private, max-age=60 days, immutable`), so the app cannot be run from its files without an account.

## API

All routes require a logged-in user and act on that user's own data.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v3/plugins/cv-yu/profiles` | List the account's CVs and the consent timestamp |
| `PUT` | `/api/v3/plugins/cv-yu/profiles/:id` | Save a CV (`{ profile, consent: true }`); at most 5 CVs, 180 KB of text each. Include `data.personal.photo` only to change the photo (`''` removes it, at most 220 KB); without it the stored photo stays |
| `DELETE` | `/api/v3/plugins/cv-yu/profiles/:id` | Delete one CV |
| `DELETE` | `/api/v3/plugins/cv-yu/profiles` | Delete all CV data and the consent record |

Uploads are validated: known fields only, length and depth limits, photos as small image data URLs.

## Development

    npm install
    npm run build      # src/ → static/dist/ (+ fonts)
    npm test
    npm run lint

The source lives in `src/` (Preact, bundled with esbuild; styles in Sass). Commit the built files in `static/dist/` together with the source.

## License

MIT. Fonts under the SIL Open Font License (see `static/fonts/LICENSE-*.txt`). Icons from [Lucide](https://lucide.dev) (ISC). [pdf.js](https://mozilla.github.io/pdf.js/) under Apache-2.0 (`static/pdf-*/LICENSE.txt`).
