# AGENTS

## Purpose

`_core/skillset/` owns first-party reusable skill packs, skill-local browser helper modules stored inside those skill folders, shared vendored browser assets reused by those helpers, and the shared browser-side skill discovery helper used by both agent surfaces.

This module is not a routed UI surface. It exists to keep skill instructions short, stable, and maintainable by moving repeatable browser-side logic into importable files that live with the skill that owns them.

Documentation is top priority for this module. After any change under `_core/skillset/`, update this file and any affected parent docs in the same session.

## Documentation Hierarchy

`_core/skillset/AGENTS.md` owns the shared skill-pack module, helper-script ownership, and the map of deeper docs inside this subtree.

Current deeper docs:

- `app/L0/_all/mod/_core/skillset/ext/skills/development/AGENTS.md`

Parent vs child split:

- this file owns module-wide skill-pack ownership, shared skill-discovery helper contracts, and skill-local helper-file contracts
- `ext/skills/development/AGENTS.md` owns the shared development skill tree and its mirrored frontend or backend source contracts

Child doc section pattern:

- `Purpose`
- `Documentation Hierarchy` when the subtree owns deeper docs
- `Ownership`
- `Local Contracts`
- `Development Guidance`

Update rules:

- update this file when shared skill-pack ownership, helper APIs, or ownership boundaries change
- update the deeper development-skill doc when the development skill tree, routing map, or mirrored source contracts change
- when framework, router, API, path, permission, or auth contracts change in ways that affect the shared development skill tree, update the deeper doc in the same session

## Ownership

This module owns:

- `ext/skills/development/`: the shared first-party frontend development skill tree and its helper scripts, including `modules-routing/panel-tools.js`
- `ext/skills/file-download/SKILL.md`: the top-level onscreen skill for downloading app files, generated files, or external URLs
- `ext/skills/pdf-report/SKILL.md` plus `ext/skills/pdf-report/pdf-report.js`: the top-level onscreen skill for browser-generated PDF creation and download, plus its generic structured-report and HTML-to-PDF helper
- `ext/skills/screenshots/SKILL.md` plus `ext/skills/screenshots/screenshots.js`: the top-level onscreen skill for page or element screenshots, plus its browser capture helper
- `ext/skills/user-management/SKILL.md`: the top-level onscreen skill for user account and membership file operations
- `skills.js`: shared browser-side skill discovery, frontmatter metadata parsing, live `<x-skill-context>` tag collection, `metadata.when` plus `metadata.loaded` plus `metadata.placement` evaluation, the runtime loaded-skill registry under `space.chat.skills`, and compact prompt-section builders reused by `_core/onscreen_agent` and `_core/admin`
- `vendor/html2canvas.min.js` and `vendor/html2canvas.LICENSE`: vendored `html2canvas@1.4.1` browser bundle and license reused by the screenshot and PDF-report helpers

## Skill Helper Contract

- this module owns repo-owned shared first-party top-level skills such as `development`, `file-download`, `pdf-report`, `screenshots`, and `user-management`; module-specific skills that describe one module's private contracts may still live under that owning module
- `skills.js` is the shared owner of the browser-side skill-discovery contract across agent surfaces: skill ids come from `ext/skills/.../SKILL.md`, live page tags come from `<x-skill-context>` elements in the current document, `metadata.when` and `metadata.loaded` may each be either `true` or a `{ tags: [...] }` condition, `metadata.when.tags` gates catalog eligibility, `metadata.loaded` controls automatic prompt inclusion after the catalog, and `metadata.placement` routes auto-included or explicitly loaded skill content into system, transient, or history context
- `metadata.loaded` may be `true` or another `{ tags: [...] }` condition; unset means the skill is only loadable on demand
- `metadata.placement` accepts `system`, `transient`, or `history`; invalid or missing values default to `history` for ordinary skills, but any skill with `metadata.loaded` may not resolve to history, so missing or invalid placement and explicit `history` all fall back to `system` unless the skill explicitly sets `transient`
- explicit `space.skills.load(...)` or `space.admin.loadSkill(...)` calls should keep returning the typed skill object for execution, but system or transient placements must also register that skill under the current surface's non-persisted `space.chat.skills` runtime and surface the short execution result text `skill loaded to system message` or `skill loaded to transient area` instead of dumping the body into history
- the shared top-level `development` skill should remain catalog-visible without a tag gate and should auto-inject through `metadata.loaded: true` plus `metadata.placement: system` so agents always see the frontend-development router before loading nested development skills
- current first-party surface-tag examples are `onscreen` from `_core/onscreen_agent`, `admin` from `_core/admin`, and feature-owned tags such as `route:<current-path>` or `space:open`
- any helper that exists for one skill must live inside that skill's folder under `ext/skills/<skill>/...`; do not add skill-specific helper modules at the `_core/skillset/` root
- skill-local helper files must stay importable through stable `/mod/_core/skillset/ext/skills/...` paths from skill instructions
- development helper files should stay focused on short browser-side workflows that a skill can call directly; the current first-party example is `ext/skills/development/modules-routing/panel-tools.js`, which lists visible dashboard panels, resolves route targets, builds routed `href` values, and navigates through `space.router` with a hash fallback
- `ext/skills/pdf-report/pdf-report.js` should remain the canonical helper for browser-generated first-party PDFs so agents stop improvising invalid raw `%PDF` strings; it should keep a small explicit API, provide generic HTML/CSS-to-PDF rendering plus a structured report builder, and avoid canned domain-specific wrappers
- `ext/skills/screenshots/screenshots.js` is browser-only and should keep its public API small and explicit
- `ext/skills/screenshots/screenshots.js` lazy-loads the module-local vendored `html2canvas@1.4.1` bundle from `/mod/_core/skillset/vendor/html2canvas.min.js` on first use and reuses the loaded global afterward
- `takeScreenshot(options)` captures `document.body` by default, applies full-page-friendly defaults for body screenshots, and returns `{ canvas, blob, width, height, type, filename }`
- `screenshotBase64(options)` returns `{ base64, width, height, type, filename }`
- `screenshotDownload(filenameOrOptions, maybeOptions)` downloads the captured image and returns `{ downloaded: true, filename, width, height, type }`
- the screenshots skill should point agents at `/mod/_core/skillset/ext/skills/screenshots/screenshots.js` instead of repeating the low-level `html2canvas` bootstrap inline
- the pdf-report skill should point agents at `/mod/_core/skillset/ext/skills/pdf-report/pdf-report.js` instead of repeating low-level PDF object assembly inline

## Development Guidance

- keep helper APIs narrow, stable, and easy to call from one short execution block
- prefer skill-local helpers over bloating `SKILL.md` with long scripts, but promote a helper into `_core/framework/` only when it becomes general frontend runtime infrastructure rather than skill-focused utility
- when a helper API changes, update the affected `SKILL.md` files in the same session
