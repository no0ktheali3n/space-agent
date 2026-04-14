# Skills And Documentation

This doc covers the shared browser-side skill-loading contract and the documentation skill/helper contract.

## Primary Sources

- `app/L0/_all/mod/_core/onscreen_agent/AGENTS.md`
- `app/L0/_all/mod/_core/skillset/AGENTS.md`
- `app/L0/_all/mod/_core/onscreen_agent/skills.js`
- `app/L0/_all/mod/_core/skillset/skills.js`
- `app/L0/_all/mod/_core/skillset/ext/skills/development/AGENTS.md`
- `app/L0/_all/mod/_core/documentation/AGENTS.md`
- `app/L0/_all/mod/_core/documentation/documentation.js`

## Skill Discovery

Onscreen skills are discovered from readable module trees:

- top-level catalog pattern: `mod/*/*/ext/skills/*/SKILL.md`
- full skill tree pattern: `mod/*/*/ext/skills/**/SKILL.md`

Important rules:

- top-level skills appear in the prompt catalog automatically
- nested skills are not listed by default
- both catalog visibility and explicit skill loads evaluate the current document's live `<x-skill-context>` tags
- `metadata.when` may be `true` or a `{ tags: [...] }` condition, and `metadata.when.tags` requires all listed tags before the skill becomes catalog-loadable
- any readable skill at any depth may still be auto-loaded with `metadata.loaded: true` or `metadata.loaded.tags`
- `metadata.placement` chooses where that auto-loaded or manually loaded skill content lands: `system`, `transient`, or `history`, except that auto-loaded skills may not resolve to `history` and therefore fall back to `system` unless they explicitly set `transient`
- skill ids are relative to `ext/skills/` without the trailing `/SKILL.md`

Current first-party skill-context examples:

- `_core/onscreen_agent/panel.html` exports `onscreen`
- `_core/admin/views/shell/shell.html` exports `admin`
- `_core/router/view.html` exports `route:<current-path>`
- `_core/spaces/view.html` exports `space:open` when a current space is active

Examples:

- `ext/skills/documentation/SKILL.md` -> `documentation`
- `ext/skills/development/modules-routing/SKILL.md` -> `development/modules-routing`

## Loading And Visibility

On-demand loading uses:

```js
await space.skills.load("skill/path")
```

Loaded skills follow the effective placement: ordinary `history` placement is inserted into execution output and then becomes part of history, while `system` and `transient` placement register runtime prompt context and return short load-result text instead of dumping the full body into history. Auto-loaded skills may not resolve to `history`, so missing or invalid placement and explicit `history` all behave as `system` unless the skill explicitly sets `transient`.

Visibility rules:

- readable group-scoped modules may contribute extra skills
- admin-only groups may contribute admin-only skills
- module-owned skill-context tags may hide those skills unless the current page exports the required tags
- same-module layered overrides replace lower-ranked skill files before the catalog is built

Conflict rules:

- skill ids must be unique across readable modules
- conflicting ids are omitted from the catalog
- loading a conflicting id fails with an ambiguity error

## Current First-Party Shared Top-Level Skills

Current repo-owned shared top-level skills include:

- `development`
- `file-download`
- `pdf-report`
- `spaces`
- `screenshots`
- `user-management`
- `documentation`

Additional group-scoped skills may exist for narrower audiences.

Some of those first-party ids are still gated by live skill-context tags. For example, the shared `file-download` and `user-management` skills require `onscreen`, while `spaces` requires `route:spaces`. The shared `development` skill is the main frontend-development router and is intentionally not tag-gated, so it remains visible and auto-included as the stable index for its nested development skills.

The first-party `development` tree is intentionally split into narrower nested skills. The top-level `development` skill is the always-included router for that tree: it should stay concise, but it must keep one visible subsection per nested development skill so agents can choose the right follow-up skill quickly.

In particular, `development/modules-routing` now teaches custom routed pages as the main alternative to spaces when the user wants a reusable feature surface, shows how to publish dashboard panels through `ext/panels/*.yaml`, and points agents at the importable helper script `/mod/_core/skillset/ext/skills/development/modules-routing/panel-tools.js` instead of pasting one-off browser snippets into the skill text.

Current first-party panel helper exports include:

- `listPanels()` for the current user's visible dashboard panels
- `findPanel(target)` for resolving a panel by visible name, route path, hash route, or direct `/mod/...` HTML path
- `resolvePanelRoutePath(target)` and `createPanelHref(target)` for converting panel targets into concrete router destinations
- `goToPanel(target)` or `openPanel(target)` for navigation through `space.router` with a hash fallback

Skill-specific browser helpers live with the skill that owns them under `ext/skills/<skill>/...`; `skills.js` owns discovery and prompt placement, not those execution helpers.

The first-party `screenshots` skill imports `/mod/_core/skillset/ext/skills/screenshots/screenshots.js`. That helper lazy-loads the vendored `html2canvas@1.4.1` bundle from `/mod/_core/skillset/vendor/html2canvas.min.js`, so page screenshots do not depend on jsDelivr or another CDN at runtime.

The first-party `pdf-report` skill imports `/mod/_core/skillset/ext/skills/pdf-report/pdf-report.js`. That helper owns the generic HTML/CSS-to-PDF pipeline, the structured report builder, and the download wrappers, so agents should use it instead of improvising raw `%PDF` strings or reusing a canned domain-specific template.

## Documentation Skill And Helper

Broad orientation starts in the top-level `documentation` skill:

```js
await space.skills.load("documentation");
```

That skill carries the compact docs map directly in its body. Use the helper below only for focused follow-up reads once you know the path you need.

The documentation helper lives at:

```txt
/mod/_core/documentation/documentation.js
```

Stable exports:

- `read("relative/path.md")`
- `url("relative/path.md")`

Examples:

```js
await space.skills.load("documentation");
const documentation = await import("/mod/_core/documentation/documentation.js");
const filesDoc = await documentation.read("server/api/files.md");
```

## How To Use These Docs Correctly

- use the `documentation` skill for fast orientation
- use the helper for focused doc reads once you know the relative path
- use the relevant `AGENTS.md` file for the concrete contract
- use code for exact implementation detail

When you change a stable contract or workflow, update all three layers together.
