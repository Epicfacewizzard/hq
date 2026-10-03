# HQ

Gordon's daily notes app: jots, today's to-dos, people and notes.
It reads and writes a **private** GitHub repo of markdown notes (an Obsidian vault). This repo holds only the app code; there is no personal data here.

- Open: https://epicfacewizzard.github.io/hq/
- First time on a device: Settings → paste a fine-grained GitHub token (only the vault repo, Contents: read and write).
- Without a token it shows made-up demo data.

Plain HTML/CSS/JS, no build step. `js/vault.js` = markdown rules, `js/store.js` = GitHub read/write, `js/app.js` = screens.
