# Deploying Mule Practice Lab

Three pieces, all free, all from this one repository:

| Piece | Where | What it is |
|---|---|---|
| The site | GitHub Pages | Static files built by `npm run build`, published by `.github/workflows/deploy-pages.yml` |
| The DataWeave runner | Render (free web service) | `runner/server.js` + the DataWeave CLI in a Docker container (`runner/Dockerfile`, `render.yaml`) |
| Your progress | Firebase (Google) — Firestore, free Spark plan | Saved to your Google account after you sign in; rules in `firestore.rules` |

Where data lives:

- **Problems** — files in `src/content/`, built into the site.
- **Your progress** — in your Google account (Firestore) once you sign in, plus a working copy in each browser.
  Every device where you sign in shows the same progress. Without signing in it stays in that browser only.
- **The runner** stores nothing: each script runs in a temporary folder that is deleted afterwards.

Do the steps in this order: Firebase (step 1) changes a file, so do it before you push.

## 1. Cloud sync for your progress (Firebase)

1. Go to <https://console.firebase.google.com> → **Create a project** (any name, e.g. `mule-practice-lab`).
   Google Analytics is not needed. The free **Spark** plan needs no card.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** (pick your email as support
   email) → **Save**.
3. Still in Authentication: **Settings → Authorized domains → Add domain** → `<your-github-user>.github.io`
   (`localhost` is already there).
4. **Build → Firestore Database → Create database** → choose a location near you (e.g. `asia-south1` for
   India; it cannot be changed later) → **Start in production mode**.
5. In Firestore open the **Rules** tab, replace everything with the contents of `firestore.rules`, **Publish**.
6. **Project settings** (gear) → **General → Your apps → Web (`</>`)** → register an app (any nickname, no
   Hosting). Copy the `firebaseConfig` object it shows.
7. Paste it into `src/sync/config.js`, replacing `null`:

   ```js
   export const firebaseConfig = {
     apiKey: '…',
     authDomain: '….firebaseapp.com',
     projectId: '…',
     storageBucket: '…',
     messagingSenderId: '…',
     appId: '…',
   }
   ```

   These values are safe to commit: they only identify the project. Access is protected by Google sign-in and
   the Firestore rules (each account can read and write only its own data).

Then on the site: **Settings → Sign in with Google** (or the button on the Learning Path). On the first sign-in
the progress already in that browser is uploaded. Sign in on your other devices the same way.

Free limits (Spark): 1 GiB stored, 50,000 document reads and 20,000 writes per day — one person's practice uses
a tiny fraction. The site only pulls what changed since its last sync.

## 2. Push the project to GitHub

Create a repository (for example `dataweave-learning`) and push this folder to its `main` branch.
`runner/bin` (the Windows DataWeave CLI) is git-ignored on purpose — the container downloads the Linux build.

## 3. Publish the site (GitHub Pages)

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the workflow from the **Actions** tab). The workflow installs, builds and publishes.
3. The site appears at `https://<your-github-user>.github.io/<repository-name>/`.

Every later push to `main` redeploys. If a content file is broken, the build fails and the live site keeps the
previous version.

## 4. Start the runner (Render)

1. Sign up at <https://render.com> with your GitHub account.
2. **New → Blueprint**, pick this repository. Render reads `render.yaml` and creates the `dataweave-runner`
   web service on the **Free** plan. Click **Apply**.
3. The first build takes a few minutes (it downloads the DataWeave CLI and checks that it starts).
4. When it is **Live**, note two things from the service page:
   - its address, e.g. `https://dataweave-runner-xxxx.onrender.com`
   - **Environment → `RUNNER_KEY`** (generated for you — click to reveal and copy)

Check it in a browser: `https://dataweave-runner-xxxx.onrender.com/healthz` should show `{"ok":true}`.

The runner only redeploys when something under `runner/` changes (content edits don't rebuild it).

## 5. Connect the site to the runner

On the published site open **Settings** (gear icon):

- **Runner URL**: the Render address (no trailing slash)
- **Runner key**: the `RUNNER_KEY` value

Click **Save & test** — it shows `✓ Connected · DataWeave 2.12.x`. The runner address and key are per device
(not synced), so enter them once on each device you use.

## How the free runner behaves

- It **sleeps after 15 minutes** without requests. The site wakes it automatically when you open a page; the
  runner badge shows **Waking…** (pulsing) for up to about a minute, then **Runner**. Runs after that are quick.
- It has 512 MB of memory, so it runs one script at a time (`MAX_CONCURRENT=1`) with a 15 s limit per run.
- Only browsers on `localhost` or a `*.github.io` site can call it, and only with the key. To lock it to your
  site alone, add an environment variable in Render: `ALLOWED_ORIGINS=https://<your-github-user>.github.io`.

## Backups

**Settings → Backup → Export backup** downloads all your progress as one JSON file; **Import backup** restores it
(for each problem the newer version wins). Handy as a second copy you control.

## Local development

```bash
npm run runner   # DataWeave runner on http://localhost:8787
npm run dev      # site on http://localhost:5173
```

To test cloud sync without a real Firebase project, run the local emulators (needs Java 11+) and start the
site against them:

```bash
npm run emulators      # first run downloads the emulators
```

```bash
npm run dev:emulator   # site on http://localhost:5173, signed in through the emulator
```

To try the production build locally: `npm run build`, then `npx vite preview --base /dataweave-learning/`
and open `http://localhost:4173/dataweave-learning/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site shows a blank page or 404 for assets | Pages source must be **GitHub Actions**; open the site with the trailing `/` |
| Settings says `Invalid or missing runner key` | Copy `RUNNER_KEY` again from Render → Environment |
| Settings says `Can't reach …` | Wait a minute (waking) and test again; check the Render service is **Live** and its logs |
| Render build fails at `dw --version` | The DataWeave CLI download changed: check the release name in `runner/Dockerfile` (`DW_VERSION`) against <https://github.com/mulesoft/data-weave-cli/releases> |
| Sign-in says the address isn't allowed | Add `<your-github-user>.github.io` in Firebase → Authentication → Settings → Authorized domains |
| Sign-in window doesn't open | Allow pop-ups for the site |
| Settings shows `Sync failed — Missing or insufficient permissions` | The Firestore rules weren't published: paste `firestore.rules` again |
| Runs time out on big inputs | Raise `RUN_TIMEOUT_MS` in Render → Environment |
