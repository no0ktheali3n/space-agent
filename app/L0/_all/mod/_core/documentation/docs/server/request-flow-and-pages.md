# Request Flow And Pages

This doc covers the top-level server routing order and the page-shell layer.

## Primary Sources

- `server/AGENTS.md`
- `server/router/AGENTS.md`
- `server/pages/AGENTS.md`
- `server/router/router.js`
- `server/router/request_context.js`
- `server/router/pages_handler.js`

## Exact Routing Order

The current server routing order is fixed:

1. API preflight handling
2. `/api/proxy`
3. `/api/<endpoint>`
4. `/mod/...`
5. `/~/...` and `/L0/...`, `/L1/...`, `/L2/...`
6. page shells and page actions

This ordering lives centrally in `server/router/router.js`.

## Auth Gating

Authenticated by default:

- `/api/proxy`
- most `/api/<endpoint>` routes
- `/mod/...`
- direct app-file fetches
- `/`
- `/admin`

Public:

- `/login`
- anonymous endpoints that explicitly export `allowAnonymous = true`

Request identity comes from `request_context.js`, which resolves the `space_session` cookie or the single-user runtime override.

When `WORKERS>1`, the HTTP layer runs in multiple worker processes, but request routing order stays the same. The primary process owns the authoritative watchdog and unified replicated state system, while workers handle normal requests with replica indexes.

That same authoritative owner also runs any server-owned periodic jobs from `server/jobs/`. Workers never execute maintenance jobs.

For `/mod/...` and extension resolution, workers should read the replicated shared-state shards they need rather than depending on a worker-local watchdog scan surface.

## Page Shells

Server-owned shells live in `server/pages/`.

Current shells:

- `index.html` for `/`
- `admin.html` for `/admin`
- `login.html` for `/login`
- `enter.html` for `/enter`

Important shell contracts:

- `/` exposes `body/start` and then `_core/router` takes over
- `/admin` exposes `page/admin/body/start`, injects `space-max-layer=0`, and then `_core/admin` takes over
- framework bootstrap also injects `_core/framework/head/end` into `document.head` on `/` and `/admin`, so readable layers can add head-side HTML or inline scripts without changing the server-owned shells
- `/login` and `/enter` cannot depend on authenticated `/mod/...` assets
- `/login` and `/enter` keep their mirrored canvas gradient and backdrop scene on fixed viewport layers, so public-shell scrolling moves only the foreground content
- every server-owned shell now declares the shared Space Agent transparent-helmet favicon family with ICO fallback, PNG browser and install icons, Apple touch icon, and app manifest so standard browser tabs, install surfaces, and Apple touch shortcuts use the same badge-free helmet silhouette
- the shared page titles are `Space Agent`, `Admin Mode | Space Agent`, `Login | Space Agent`, and `Enter Space | Space Agent`
- page shells can declare `SPACE_PROJECT_VERSION` for server-side version injection; `/login` and `/enter` both place that resolved version value below a centered footer row of outbound GitHub, Discord, X, and Agent Zero-logo icons
- `/login` keeps the public run-it-yourself path inside a recovery-safe two-panel modal with `Native App` and `Own Server` choices, a privacy/security subtitle, and one short explanatory line per option; its app action links to `https://github.com/agent0ai/space-agent/releases/latest`, and server hosting links to the README `#host` section
- `/login` also keeps a navigation-only footer row of local SVG icon links to `https://github.com/agent0ai/space-agent`, `https://discord.gg/B8KZKNsPpj`, `https://agent-zero.ai`, and `https://x.com/Agent0ai`
- `/enter` reuses that same navigation-only footer row of local SVG icon links to `https://github.com/agent0ai/space-agent`, `https://discord.gg/B8KZKNsPpj`, `https://agent-zero.ai`, and `https://x.com/Agent0ai`, and in packaged Electron runs it may also run a recovery-safe background update check, reveal an update button below `Admin Mode` only when the preload bridge reports an available or downloaded update, and collapse update-check failures behind a `Could not check updates` disclosure with expandable raw details
- `/login` and `/enter` both run the shared public-shell browser compatibility gate from `server/pages/res/browser-compat.js` before their page logic starts; the gate renders a blocking message when the browser is missing core runtime features such as modern JavaScript syntax, dynamic module loading, fetch, storage, text codecs, or Web Crypto
- `/login` uses browser Web Crypto for password-login proof generation and `userCrypto` provisioning; when secure-context crypto features are unavailable, the compatibility gate surfaces that missing Web Crypto contract instead of letting raw browser exceptions leak into the shell
- `/login` also uses the public helper at `server/pages/res/user-crypto.js` to provision or unlock the per-user wrapped browser key as part of the same login transaction; successful sign-in stores the unlocked browser crypto cache in `sessionStorage`, keyed by username plus backend `sessionId`, stores a session-scoped bootstrap secret when the login started from `userCrypto: missing`, and refuses to redirect when login still reports `userCrypto: missing`; if the first authenticated app boot still cannot recover that missing state, `_core/user_crypto` signs the browser back out so the user does not stay in a half-working app session
- server page shells must load runtime resources only from local page assets, inline SVG/CSS, or local `/mod/...` module assets; external URLs in page shells are navigation targets only
- `/logout` is handled by the pages layer and clears the session before redirecting to `/login`
- platform-standard root asset URLs such as `/favicon.ico`, `/apple-touch-icon.png`, and `/site.webmanifest` are page-layer aliases into `server/pages/res/`, so public and authenticated shells can share one transparent-helmet favicon contract without separate per-shell exports

## Launcher Behavior

`/enter` is the firmware-backed launcher shell.

Current rules:

- always available in single-user mode
- available to authenticated multi-user requests
- unauthenticated multi-user requests are redirected to `/login`
- the launcher shell reuses the public footer icon row and then shows the resolved project version beneath it; source checkouts use the Git-derived project version, while package-only runtimes fall back to the package version, and packaged Electron runs can run the native update check from `/enter` automatically while keeping the actual download or restart-to-install action explicit
- `/` and `/admin` receive a pre-module launcher guard when the current request is launcher-eligible, so browser-opened new tabs route through `/enter?next=<current-url>` while reloads in the same tab keep loading normally
- framework-created same-origin `_blank` opens for `/` and `/admin` may pre-grant the same tab-access marker before navigation so app-requested windows skip `/enter`

## Direct App-File Fetches

The router supports direct authenticated fetches for app files:

- `/~/...` -> current user's `L2/<username>/...`
- `/L0/...`, `/L1/...`, `/L2/...` -> logical layer paths

These paths stay logical even when writable storage is relocated through `CUSTOMWARE_PATH`.

## Cross-Worker Visibility

Clustered writes are ordered through the primary watchdog owner and the shared state version.

Current rules:

- after a worker finishes a mutating request, it commits the changed logical app paths to the primary once
- the primary updates the authoritative replicated state, schedules any debounced writable-layer Git history commit for the rebuilt owner roots, and broadcasts deltas or snapshots asynchronously; native local-history work then runs through an async per-owner queue, and writes do not wait for every worker to acknowledge or for Git commits to finish
- primary-owned maintenance jobs use that same watchdog mutation path after each filesystem change; they do not bypass the replicated-state refresh flow
- responses advertise the worker's current replicated version through `Space-State-Version`
- responses also advertise the handling worker number through `Space-Worker`
- the primary watchdog seeds that version space from a long startup epoch and then increments monotonically, so a restarted runtime does not fall behind a browser's previously observed version while delta replay stays exact
- the frontend fetch wrapper carries the highest seen `Space-State-Version` on follow-up same-origin requests and automatically retries the router's bounded sync `503` responses a few times
- if a request lands on a worker that is behind the requested version, the worker first pulls from the primary immediately, then waits briefly for local catch-up before handling the request or returns a retryable `503`
