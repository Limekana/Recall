# Recall

Recall is a local-first flashcard study app for Android and the web. It focuses on fast set creation, transparent adaptive learning, scheduled review, tests, and lightweight games. Cross-device sync is optional and uses one personal key.

## What is included

- Create, edit, duplicate, archive, and delete study sets
- Add cards manually or import tab-, comma-, semicolon-, and newline-separated text
- Flashcards with keyboard, touch, reverse-direction, and shuffle controls
- Deterministic Learn mode that shifts from recognition to typed recall as mastery grows
- Due-card Review mode with explainable intervals
- Configurable tests with multiple choice, written recall, and true/false questions
- Match and Block Blast games with locally stored results
- Local progress and session history using IndexedDB via Dexie
- Optional private-key sync between Android and the web
- Explicit conflict resolution when two devices change the same library
- Installable offline PWA and a Capacitor Android project
- Unit tests for scheduling, mastery, due-card selection, importing, and answer comparison

## Run on the web

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run test
npm run build
```

The production web build is written to `dist/`. Local-only mode works on any static host; private sync needs the `api/sync.ts` Vercel Function on `recall.limecore.dev`. Client navigation uses URL hashes, so no rewrite rule is required.

## Optional cross-device sync

Recall remains complete without an account or network connection. To enable sync, connect a **private** Vercel Blob store to the Recall project and set these server-side environment variables in Vercel:

```text
BLOB_READ_WRITE_TOKEN
RECALL_SYNC_KEY_SHA256
```

`RECALL_SYNC_KEY_SHA256` is the lowercase SHA-256 hex digest of a randomly generated, high-entropy personal key. Never use a `VITE_` prefix for it or commit the key. Enter the original key on each device's Sync page. Android calls `https://recall.limecore.dev/api/sync`; the website calls its same-origin endpoint. To test the server locally, run `vercel dev` with development credentials configured.

Sync stores one versioned snapshot in private Blob storage behind a key-protected Vercel Function. Every write carries the last known cloud revision and uses a conditional ETag write. If the cloud and device both changed, Recall pauses and asks which complete library to keep; it never silently merges or overwrites divergent copies. The prior Supabase migration in `supabase/migrations/` is historical and is not used by the current app; do not remove its old cloud copy until the new sync is verified on both devices.

## Run on Android

Android Studio and a JDK compatible with the installed Android Gradle plugin are required.

```bash
npm run android:sync
npm run android:open
```

In Android Studio, select a connected device or emulator and run the `app` configuration. The Capacitor application ID is `com.limecore.recall`.

## Architecture

The UI, learning engine, and persistence are intentionally separate:

```text
React UI → pure study engine → RecallRepository → Dexie / IndexedDB
                                      ↕ optional snapshot sync
                         Vercel Function + private Blob
```

`src/engine/learningEngine.ts` accepts current card state plus an answer event and returns the next state. Dexie remains the authoritative working copy; the sync layer exports and restores complete versioned snapshots through the repository boundary.

## Learning model

The v1 algorithm is deliberately simple and testable, not presented as scientifically optimal:

- Multiple choice and true/false correct answers add less mastery than typed recall.
- Correct streaks add a small capped bonus.
- Wrong answers reduce mastery, clear the streak, and schedule a near-term review.
- Low-mastery cards mostly use multiple choice; high-mastery cards mostly require typed recall.
- The question format decision is deterministic for a given card and attempt count.

The engine can later be replaced with FSRS without changing the UI or storage boundary.

## Privacy and offline behavior

All sets, cards, progress, and session history remain in the browser or app WebView database. Recall has no analytics. Network requests occur only when a user opts into sync, and disconnecting does not delete local study data. The personal key is saved on each connected device; its hash, not the key, is stored in the server configuration. Vercel hosts the private cloud copy; this is not end-to-end encrypted storage.
