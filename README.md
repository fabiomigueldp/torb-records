# Project Title (To be updated)

This project is a monorepo containing a backend service and a frontend application.

## Development Setup

To get the development environment running:

1.  **Prerequisites:**
    *   Docker and Docker Compose installed.
    *   VS Code with the Dev Containers extension (optional, for using `.devcontainer`).

2.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

3.  **Run the services:**
    ```bash
    docker-compose up
    ```
    This will start:
    *   The backend API service on `http://localhost:8000`
    *   The frontend development server on `http://localhost:5173`

    You should see messages indicating that the "Torb Records API alive" and "Web dev server ready".

---
# Torb Records

> **A personal, arcade‑inspired music‑streaming PWA for you and your friends.**

Torb Records lets you upload, transcode and stream your own music library, create playlists, chat with friends in real‑time and customize the entire interface with five retro arcade themes.

---

## ✨ Features

| Area | Highlights |
|------|------------|
| **Streaming** | Multi‑bitrate AAC‑HLS (64/128/256 kbps) served to any HTML5 browser (HLS.js fallback) |
| **Upload** | Drag‑and‑drop MP3/WAV upload, cover image support, auto‑transcode via FFmpeg |
| **Playlists & Queue** | Personal or shared playlists, drag‑drop reorder, shuffle & repeat modes |
| **Themes** | Five built‑in skins — Neon, RetroCRT, Synthwave, Vaporwave, Midnight — persisted per user |
| **Social** | Presence ("🎧 User is listening to …"), global chat, private DM, unread badges, notifications |
| **Admin** | Super‑user dashboard to manage users, approve deletion requests, hard‑delete tracks |
| **PWA** | Installable on desktop & iOS; offline shell; service‑worker caching |
| **Accessibility** | WCAG‑AA contrast, full keyboard navigation, ARIA landmarks |
| **CI/CD** | GitHub Actions: lint, unit tests, Cypress E2E, Lighthouse ≥ 90, Docker prod image |

---

## 🏗️ Architecture

```
docker-compose (prod)
├─ caddy  : reverse proxy + HTTPS
├─ api    : FastAPI  · FFmpeg  · SQLite
│   ├─ /media     – HLS segments
│   ├─ /uploads   – raw audio + covers
│   └─ /config    – users.json
└─ web    : Nginx serving React build
```

*Dev compose* swaps Caddy+Nginx for Vite dev‑server and reloadable Uvicorn.

---

## 🚀 Quick Start (Production)

> Prerequisites: Docker 20+, Docker Compose v2, ports 80/443 open.

```bash
git clone https://github.com/your‑user/torb‑records.git
cd torb‑records
docker compose -f infra/docker-compose.prod.yml up --build -d
```

Then open <https://localhost> and log in with:

| Username | Password | Role |
|----------|----------|------|
| `fabiomigueldp` | `abc1d2aa` | Super‑user ( “torbsführer” 👑 ) |

---

## 🧑‍💻 Local Development

```bash
# backend + frontend hot‑reload
docker compose up --build

# Storybook component explorer
npm run storybook             # http://localhost:6006

# Run unit tests
pytest
npm run test

# Run Cypress E2E + accessibility checks
npm run cypress:accessibility
```

DevContainer config is included for VS Code (`F1 > Dev Containers: Reopen Folder in Container`).

---

## ⚙️ Configuration

All runtime paths are **mounted volumes** so you never lose data when updating containers.

| Volume            | Purpose                       | Dev Path (bind)            | Prod Path (named) |
|-------------------|-------------------------------|----------------------------|-------------------|
| `media-data`      | Final HLS playlists/segments  | `./volumes/media`          | `media-data`      |
| `upload-data`     | Raw uploads + covers          | `./volumes/uploads`        | `upload-data`     |
| `config-data`     | `users.json` credentials      | `./config`                 | `config-data`     |
| `db.sqlite3` file | SQLite database               | inside `media-data` volume | ^                 |

Environment variables (`.env`) – most values are optional defaults:

```
TORB_PORT=8000
TORB_DB_URL=sqlite:///app/db.sqlite3
TORB_STATIC_DIR=/app/static
TORB_FFMPEG_BIN=ffmpeg
```

---

## 🔐 Users & Roles

* **Super‑user `fabiomigueldp`**  
  – Full admin console, crown badge, immutable uploads (always visible), can promote others.

* **Regular Users**  
  – Upload audio, create playlists, chat, request deletions.

To add a new user via UI: `Admin > Users > Add`.  
The JSON file `config/users.json` is written automatically and persisted inside the `config-data` volume.

---

## 📦 Build & Deploy Custom Image

```bash
docker build -t torb_records:latest .
docker run -p 8000:8000 -v $(pwd)/volumes:/data torb_records:latest
```

*Entrypoint* automatically runs Alembic migrations before booting Uvicorn.

---

## 📊 Tests & Quality Gates

| Pipeline Stage            | Tooling                    |
|---------------------------|----------------------------|
| Lint                      | Ruff (py), ESLint (ts)     |
| Unit Tests                | Pytest, Vitest             |
| Theme Snapshot            | Storybook + Jest‑Image     |
| E2E & Accessibility       | Cypress + axe‑core         |
| Performance & PWA         | Lighthouse CI (≥ 90 score) |

Run them all locally:

```bash
make test    # wrapper for lint + unit
make e2e     # spin compose + cypress
make audit   # lighthouse in headless chrome
```

---

## 🎨 Theming Guide

Each theme is defined in `tailwind.config.cjs` under `daisyui.themes`.  
Switch at runtime via the dropdown in the top‑right corner; the current choice is persisted server‑side (`PUT /api/preferences`) so the theme travels with you across devices.

If you create a new theme:

1. Duplicate an existing theme block, change primary/secondary colors.  
2. Add a `<YourTheme>` story in `stories/ThemeGallery.stories.tsx`.  
3. Run `npm run test:theme` to generate snapshots and make sure everything renders.

---

## 📝 Roadmap / Tasks Reference

The project was built through seventeen structured Jules tasks:

1. Repo & CI bootstrap → 15. PWA build & docs  
16. Theme auditing (Storybook)  
17. UX/A11y polish

You can read the complete task list in `docs/tasks.md`.

---

## 🤝 Contributing

This is a private hobby project intended for a small friend group.  
Feel free to fork, adapt and share improvements via pull request.

---

## ⚠️ Disclaimers & Limitations

* **Not scalable** – single‑instance FastAPI + SQLite; perfect for ≤ 20 concurrent users.  
* **Credentials stored in plain JSON** by design; do _not_ expose to the public internet.  
* **iOS PWA background audio** may stop after ~2 min (WebKit limitation).  
* No DRM – any logged‑in user can technically download `.m3u8` URLs.

---

## 📄 License

MIT © 2025 Fabio Miguel (and friends) – see `LICENSE.md`.
