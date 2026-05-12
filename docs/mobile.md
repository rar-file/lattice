# Lattice on iOS and Android

The Tauri 2 desktop shell in `apps/desktop` is set up to also build for iOS and
Android. The catch: PyInstaller can't produce binaries that run on mobile, so
the `lattice-api` sidecar approach won't work directly on a phone. Mobile
builds run as a **WebView pointed at a cloud Lattice API** instead.

This file documents how to actually ship a mobile build.

## Architecture

```
┌──────────────────────┐       https        ┌─────────────────────┐
│  Lattice iOS / And.  │ ───────────────►   │  Lattice Cloud API  │
│  Tauri WebView       │ ◄───────────────   │  (Postgres + …)     │
│  bundled Next.js     │                    │  apps/api in CLOUD  │
└──────────────────────┘                    └─────────────────────┘
```

- The mobile app is a thin Tauri shell that loads the bundled Next.js export.
- Set `NEXT_PUBLIC_LATTICE_API_URL` at build time to the cloud endpoint, or
  let the user set it on first launch via Settings.
- All M2 (auth / sync / MCP) features work over HTTPS — capture, search,
  chat, ambient links, and synthesis are fully functional.

## iOS — one-time setup

You need a Mac with Xcode 15 or newer, an Apple Developer account, and
Rust set up via `rustup`.

1. Install the iOS Rust targets:
   ```sh
   rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
   ```
2. Configure your signing team in `apps/desktop/src-tauri/tauri.conf.json`:
   ```json
   "iOS": { "developmentTeam": "ABCDE12345" }
   ```
3. From `apps/desktop`:
   ```sh
   pnpm tauri ios init
   ```
   This creates `apps/desktop/src-tauri/gen/apple/` (Xcode project). Commit
   this folder.

## iOS — building

```sh
# In apps/desktop:
NEXT_PUBLIC_LATTICE_API_URL=https://cloud.your-lattice.example \
  pnpm tauri ios build --release
```

For TestFlight / App Store distribution, open `gen/apple/lattice.xcodeproj`
in Xcode and use **Product → Archive** to upload via the standard flow.

## Android — one-time setup

You need Android Studio (or `sdkmanager` + JDK 17) and the NDK.

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
export ANDROID_HOME=$HOME/Library/Android/sdk     # or your install path
export NDK_HOME=$ANDROID_HOME/ndk/26.1.10909125    # whichever NDK you have
```

```sh
# In apps/desktop:
pnpm tauri android init
pnpm tauri android build --release
```

The APK / AAB is written under `gen/android/app/build/outputs/`.

## Configuring the API URL at runtime

If you don't want to bake the cloud URL into the build, the web layer reads
`process.env.NEXT_PUBLIC_LATTICE_API_URL`. The app falls back to
`http://127.0.0.1:8787` (which doesn't exist on a phone). Either:

- Set the env var at build time (preferred for production builds).
- Or expose a settings screen that writes to `localStorage` and have
  `lib/client.ts` read it — see issue tracker for the proposed change.

## Why not bundle the API on-device?

PyInstaller, the tool we use to ship the API alongside the desktop app, only
builds binaries for the host OS / architecture. iOS/Android don't accept
arbitrary executables, and bundling CPython into a mobile app is a much
bigger investment (BeeWare's Briefcase, PyTorch Mobile-style embedding,
or porting the API to a Rust/Go backend running natively).

For the same reason that you wouldn't run Postgres on your phone, the
canonical answer for mobile Lattice is **cloud mode with the phone as a
WebView client**.
