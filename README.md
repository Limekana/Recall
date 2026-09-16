# Recall

Recall is a local-first flashcard study app for Android and the web. It focuses on fast set creation, transparent adaptive learning, scheduled review, tests, and lightweight games—without requiring an account, a backend, or AI.

## What is included

- Create, edit, duplicate, archive, and delete study sets
- Add cards manually or import tab-, comma-, semicolon-, and newline-separated text
- Flashcards with keyboard, touch, reverse-direction, and shuffle controls
- Deterministic Learn mode that shifts from recognition to typed recall as mastery grows
- Due-card Review mode with explainable intervals
- Configurable tests with multiple choice, written recall, and true/false questions
- Match and Rapid Fire games with locally stored results
- Local progress and session history using IndexedDB via Dexie
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
```

`src/engine/learningEngine.ts` accepts current card state plus an answer event and returns the next state. The repository interface in `src/db/repository.ts` keeps local persistence replaceable if optional sync is added later.

## Learning model

The v1 algorithm is deliberately simple and testable, not presented as scientifically optimal:

- Multiple choice and true/false correct answers add less mastery than typed recall.
- Correct streaks add a small capped bonus.
- Wrong answers reduce mastery, clear the streak, and schedule a near-term review.
- Low-mastery cards mostly use multiple choice; high-mastery cards mostly require typed recall.
- The question format decision is deterministic for a given card and attempt count.

The engine can later be replaced with FSRS without changing the UI or storage boundary.

## Privacy and offline behavior

All sets, cards, progress, and session history remain in the browser or app WebView database. Recall makes no network requests after installation and has no analytics or account system.

