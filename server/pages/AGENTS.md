# AGENTS

## Purpose

`server/pages/` contains the server-owned HTML shells and public shell assets.

These files define entry shells and pre-auth presentation only. They should not become a second frontend application runtime.

Documentation is top priority for this subtree. After any change under `server/pages/`, update this file and any affected parent or linked module docs in the same session.

## Ownership

Current page shells:

- `index.html`: authenticated root shell for `/`
- `admin.html`: authenticated admin shell for `/admin`
- `login.html`: public password-login shell for `/login`
- `enter.html`: firmware-backed launcher shell served at `/enter` for launcher-eligible sessions

Current public shell assets:

- `res/space-backdrop.css`
- `res/space-backdrop.js`
- `res/browser-compat.js`
- `res/enter-guard.js`
- `res/user-crypto.js`
- login-shell image assets under `res/`
- login-shell social-link SVG assets under `res/`
- shared transparent helmet favicon assets and `res/site.webmanifest`

## Shell Contracts

`index.html`:

- loads shared framework CSS and `/mod/_core/framework/js/initFw.js`
- when the current request already has launcher access, receives a page-shell guard before `/mod/...` assets so a new browser-opened tab or window is redirected to `/enter?next=<current-url>` before customware loads; framework-created same-origin `_blank` opens may pre-grant the same tab-access marker before loading this shell
- receives injected `meta[name="space-config"]` tags for any `frontend_exposed` runtime parameters
- declares the shared Space Agent transparent-helmet favicon set, including ICO fallback, PNG browser and install icons, Apple touch icon, and app manifest metadata
- keeps the body minimal and exposes exactly the `body/start` extension anchor

`admin.html`:

- loads the same framework bootstrap with `?maxLayer=0`
- when the current request already has launcher access, receives the same page-shell guard before `/mod/...` assets so a new browser-opened tab or window is redirected to `/enter?next=<current-url>` before admin shell assets load; framework-created same-origin `_blank` opens may pre-grant the same tab-access marker before loading this shell
- declares `meta[name="space-max-layer"]` with content `0`
- receives the same injected `meta[name="space-config"]` tags for `frontend_exposed` runtime parameters
- declares the shared Space Agent transparent-helmet favicon set, including ICO fallback, PNG browser and install icons, Apple touch icon, and the `Admin Mode | Space Agent` document title
- keeps the body minimal and exposes exactly the `page/admin/body/start` extension anchor

`login.html`:

- is public and must not depend on authenticated `/mod/...` assets
- owns the login flow, guest creation flow, and pre-auth layout
- renders a centered footer below the main shell content with white semi-transparent outbound icons for GitHub, Discord, X, and a slightly larger Agent Zero logo in the last slot, then places the injected `SPACE_PROJECT_VERSION` value beneath that icon row
- reads injected `meta[name="space-config"]` tags directly so guest-login UI can follow backend runtime parameters without authenticated module imports
- declares the shared Space Agent transparent-helmet favicon set, including ICO fallback, PNG browser and install icons, Apple touch icon, and the `Login | Space Agent` document title
- runs the shared public-shell browser compatibility gate from `server/pages/res/browser-compat.js` before login logic starts, and renders a visible blocking message when the browser is missing required runtime features such as modern JavaScript syntax, module loading, fetch, storage, text codecs, or Web Crypto
- runs the per-user `userCrypto` provisioning or unlock step inside the same `/api/login_challenge` plus `/api/login` transaction using the public helper in `server/pages/res/user-crypto.js`; the helper must stay public because `/login` cannot depend on authenticated `/mod/...` assets
- stores the unlocked `userCrypto` session cache in `sessionStorage` only, keyed by username plus backend `sessionId`, so decrypted key material stays scoped to the current browser session
- when login starts from a `userCrypto: missing` challenge, it also stores a session-scoped bootstrap secret derived from the successful password login so the first authenticated app load can finish provisioning through `/api/user_crypto_bootstrap` if the login-side provisioning write did not stick before redirect
- if that first authenticated recovery pass still leaves `userCrypto` missing, the authenticated bootstrap should sign the browser out instead of leaving the app running in a half-working state
- if login completes without a usable `userCrypto` record, the shell must fail sign-in in place instead of redirecting into an authenticated-page logout loop
- grants same-tab launcher access in `sessionStorage` after successful password sign-in so the tab that just authenticated can land on `/` while fresh tabs still route through `/enter`
- renders the guest-account removal warning with yellow warning treatment and a recovery-safe inline Google Material Symbols warning icon, without depending on authenticated icon fonts
- keeps the self-host call-to-action visually separated from the sign-in form even when guest account creation is disabled and the guest-only block is hidden
- opens the self-host call-to-action as a two-panel login-styled modal: `Native App` and `Own Server` panels split left-right on desktop and stack top-bottom on mobile, with a privacy/security subtitle, one short explanatory line per panel, a large inline Material icon, and a local inline-icon action button
- keeps the modal's outbound URLs as navigation only: the native app button links to the `agent0ai/space-agent` latest-release redirect, and the server-hosting button links to the README `#host` section
- keeps the footer social links as navigation-only outbound targets to the Space Agent repository, Discord community, Agent Zero website, and X account
- keeps the mobile shell scrollable when the viewport is shorter than the content, and reserves extra small-screen side spacing for the intro column rather than inflating the login card
- keeps the mirrored canvas gradient and star or glow backdrop pinned to fixed viewport layers while the login shell content scrolls
- keeps login-specific styling and motion local

`enter.html`:

- must stay safe even when routed customware is broken
- must not depend on authenticated `/mod/...` assets
- is served for launcher-eligible sessions; in multi-user mode, unauthenticated requests are redirected to `/login` before this shell loads
- owns the firmware-backed launcher UI that links to `/` and `/admin`, labeled as Enter Space and Admin Mode, and when the Electron preload bridge reports a packaged desktop runtime with updater support it also runs a background update check, reveals an update button below `Admin Mode` only after a newer bundle is available or ready to install, and collapses update-check failures behind a `Could not check updates` disclosure that expands into left-aligned raw details
- declares the shared Space Agent transparent-helmet favicon set, including ICO fallback, PNG browser and install icons, Apple touch icon, and the `Enter Space | Space Agent` document title
- runs the shared public-shell browser compatibility gate from `server/pages/res/browser-compat.js` before launcher logic starts, and renders the same blocking message contract as `/login` when the browser is missing required runtime features for the later app shell
- renders the same centered footer treatment as `/login`: white semi-transparent outbound icons for GitHub, Discord, X, and a slightly larger Agent Zero logo in the last slot, followed by the injected `SPACE_PROJECT_VERSION` value beneath that icon row
- accepts an optional `next` query param, grants per-tab launcher access through `sessionStorage`, and routes the Enter or Admin buttons back to the original target when appropriate
- mirrors the login-shell intro layout, floating astronaut, and public backdrop while replacing the right-side form card with direct launcher actions
- keeps the footer social links as navigation-only outbound targets to the Space Agent repository, Discord community, Agent Zero website, and X account
- keeps extra small-screen side spacing around the launcher shell and a generous top and inter-button gap when the launcher actions collapse below the intro copy
- should reuse the mirrored public backdrop assets instead of introducing a second standalone visual system

## Public Asset Mirroring

`/login` and `/enter` cannot rely on authenticated module assets for recovery-safe shells, and launcher-gated page shells must redirect before customware loads, so `server/pages/res/space-backdrop.css`, `server/pages/res/space-backdrop.js`, `server/pages/res/browser-compat.js`, and `server/pages/res/enter-guard.js` mirror the public-shell recovery behavior.

Rules:

- keep the mirrored public backdrop aligned with `_core/visual`
- keep both the mirrored base canvas gradient and the mirrored star or glow scene fixed to the viewport so public-shell scrolling never drags them
- if the shared backdrop visuals or runtime behavior change, review and update these mirrored files in the same session
- keep public-shell assets under `server/pages/res/` instead of embedding large data blobs into page HTML
- keep the shared favicon asset family in `server/pages/res/`, derive it from the onscreen-agent assistant helmet avatar, keep the background transparent, and scale the helmet to fill the available icon space without reintroducing a badge or circular plate
- keep the manifest icon entries as standard install icons rather than `maskable` assets unless the icon family is intentionally redesigned for adaptive-icon safe zones
- server page shells must not load remote runtime resources; scripts, styles, fonts, images, icons, and recovery visuals must be local files or inline SVG/CSS so `/login`, `/enter`, `/`, and `/admin` can load without internet access
- external `https://...` URLs in page shells are allowed only as explicit user navigation targets, never as required runtime assets

## Development Guidance

- keep page shells thin and static
- expose stable anchors and let browser modules own dynamic composition
- keep recovery-safe shell behavior local to `login.html`, `enter.html`, and `server/pages/res/`
- do not hardwire authenticated app structure into page shells when an extension seam can own it
- if page-shell contracts or mirrored public assets change, also update the matching docs under `app/L0/_all/mod/_core/documentation/docs/server/`
- if page-shell contracts or mirrored public assets change, update this file and the related app docs
