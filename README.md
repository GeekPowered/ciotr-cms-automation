# CIOTR CMS Automation

Location page generator for Cold Is On the Right Plumbing & Air. Generates unique location-specific service pages using Claude and pushes them to Webflow CMS as drafts.

## Requirements

- Node.js 18+
- A populated `.env` file (already in place)

## Install

```bash
npm install
```

## Start

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

For auto-restart on file changes during development:

```bash
npm run dev
```

## How to use

1. Select a **location** from the dropdown (11 Austin-area cities)
2. Select a **page type** from the dropdown (37 service pages)
   - Page types marked with **✦** have no reference file yet — Claude generates from scratch and saves the output as a new reference after you approve it
3. Click **Generate** — Claude writes unique location-specific content (~20-30 seconds)
4. Review the preview panel — all fields are shown with their type and slug
5. Either:
   - **Approve & Push to Webflow** — creates a draft CMS item (never auto-publishes)
   - **Regenerate** — discards and generates fresh content for the same selection

## Project structure

```
├── server.js              # Express backend
├── public/
│   ├── index.html         # App UI
│   ├── style.css          # Styles
│   └── app.js             # Frontend logic
├── reference-pages/       # Scraped reference content (21 files)
├── webflow-schema.json    # Webflow collection schema
├── scrape-references.js   # Utility to re-scrape reference pages
├── .env                   # API keys (do not commit)
└── README.md
```

## Environment variables (`.env`)

```
WEBFLOW_API_TOKEN=
WEBFLOW_SITE_ID=
WEBFLOW_COLLECTION_ID=
ANTHROPIC_API_KEY=
```

## Notes

- All pages are pushed as **drafts** — nothing is published automatically
- The `slug` field is set to the page type (e.g. `plumbing`) with no location prefix — the location is determined by which Webflow collection you're pushing to
- To switch locations/collections, update `WEBFLOW_COLLECTION_ID` in `.env` and restart the server
- Service items cap at 11 slots (current schema limit) — update `WEBFLOW_COLLECTION_ID` after the schema is expanded to 16
