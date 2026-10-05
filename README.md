# CV Builder for NodeBB (nodebb-plugin-cv-yu)

A privacy-first résumé editor that lives inside a NodeBB 4 forum at `/cv`. Built for [Yaşar Forum](https://yu.uniforum.app), usable by any forum.

- **Real A4 pages.** The preview measures every block and lays it out on true A4 pages, so the page count on screen is the page count in the PDF. Section headings never end up alone at the bottom of a page.
- **Print-ready PDF.** Printing uses the same pages at 210 × 297 mm with zero margins. The PDF is text, not an image, so it is searchable and ATS-friendly.
- **Three templates:** clean (single column), sidebar (two columns, tinted side) and compact. Colours, three self-hosted typefaces (Inter, Source Sans 3, Source Serif 4 — all OFL), text size, line spacing, margins, heading style, contact icons and photo shape are adjustable.
- **Twelve sections** with reordering, hiding and custom headings; bullet points per entry; a photo that is shrunk in the browser before it is stored.
- **Device-first storage.** Everything stays in the browser's local storage. Nothing reaches the server unless the person chooses *Store in my account* and gives explicit consent (the consent text names the server's country, as KVKK art. 9 requires). *Delete my data* wipes the server copy immediately; deleting the forum account deletes it too.
- **No analytics, no third-party requests.** Fonts come from the forum's own server.
- **JSON export and import.** Reads this plugin's format and the export format of the IEU Forum CV tool.
- **Turkish and English UI.** The CV language is separate: it sets headings, date formatting and the `lang` attribute (so uppercase headings get İ/ı right).

Requires NodeBB 4.15 or later.

## Installation

    npm install nodebb-plugin-cv-yu

Activate the plugin in the ACP, rebuild and restart. Then add `/cv` to the navigation (ACP → Settings → Navigation).

## How it loads

The app itself is not bundled into NodeBB's `nodebb.min.js`. The tiny `forum/cv` page module injects the hashed `static/dist/cv.<hash>.js` and `.css` only on the `/cv` page, served with NodeBB's 60-day cache for plugin static files.

## API

All routes require a logged-in user and act on that user's own data.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v3/plugins/cv-yu/profiles` | List the account's CVs and the consent timestamp |
| `PUT` | `/api/v3/plugins/cv-yu/profiles/:id` | Save a CV (`{ profile, consent: true }`); at most 5 CVs, 400 KB each |
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

MIT. Fonts under the SIL Open Font License (see `static/fonts/LICENSE-*.txt`). Icons from [Lucide](https://lucide.dev) (ISC).
