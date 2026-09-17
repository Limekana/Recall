# Recall

Recall is a local-first flashcard study app for Android and the web. It focuses on fast set creation, transparent adaptive learning, scheduled review, tests, and lightweight games. An account is optional and exists only for cross-device sync.

## What is included

- Create, edit, duplicate, archive, and delete study sets
- Add cards manually or import tab-, comma-, semicolon-, and newline-separated text
- Flashcards with keyboard, touch, reverse-direction, and shuffle controls
- Deterministic Learn mode that shifts from recognition to typed recall as mastery grows
- Due-card Review mode with explainable intervals
- Configurable tests with multiple choice, written recall, and true/false questions
- Match and Block Blast games with locally stored results
- Local progress and session history using IndexedDB via Dexie
- Optional email-based sync between Android and the web
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

The static production build is written to `dist/` and can be deployed to Vercel or any static host. Client navigation uses URL hashes, so no rewrite rule is required.

## Optional cross-device sync

Recall remains complete without an account or network connection. To enable sync, provide these build-time environment variables in local builds and Vercel:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`VITE_SUPABASE_ANON_KEY` is also accepted for older Supabase projects. Apply `supabase/migrations/20260917_recall_sync.sql` to the selected Supabase project before enabling the variables.

Sync stores one private snapshot per authenticated user behind row-level security. Every write carries the last known cloud revision. If the cloud and device both changed, Recall pauses and asks which complete library to keep; it never silently merges or overwrites divergent copies.

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
                              Supabase Auth + Postgres RLS
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

All sets, cards, progress, and session history remain in the browser or app WebView database. Recall has no analytics. Network requests occur only when a user opts into sync, and signing out does not delete local study data.
