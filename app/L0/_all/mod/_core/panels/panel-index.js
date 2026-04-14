import {
  normalizeIconHexColor,
  normalizeMaterialSymbolName
} from "/mod/_core/visual/icons/material-symbols.js";
import { normalizeRoutePath } from "/mod/_core/router/route-path.js";

const PANEL_EXTENSION_POINT = "panels";
const PANEL_EXTENSION_FILTERS = Object.freeze(["*.yaml", "*.yml"]);
const DEFAULT_PANEL_ICON = "web";
const DEFAULT_PANEL_COLOR = "#94bcff";

function getRuntime() {
  const runtime = globalThis.space;

  if (!runtime || typeof runtime !== "object") {
    throw new Error("Space runtime is not available.");
  }

  if (!runtime.api || typeof runtime.api.call !== "function") {
    throw new Error("space.api.call is not available.");
  }

  if (
    !runtime.utils ||
    typeof runtime.utils !== "object" ||
    !runtime.utils.yaml ||
    typeof runtime.utils.yaml.parse !== "function"
  ) {
    throw new Error("space.utils.yaml.parse is not available.");
  }

  return runtime;
}

function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePanelName(value) {
  return collapseWhitespace(value);
}

function normalizePanelDescription(value) {
  return collapseWhitespace(value);
}

function normalizePanelIcon(value) {
  return normalizeMaterialSymbolName(value) || DEFAULT_PANEL_ICON;
}

function normalizePanelColor(value) {
  return normalizeIconHexColor(value) || DEFAULT_PANEL_COLOR;
}

function normalizeModuleRoutePath(requestPath) {
  const normalizedRequestPath = String(requestPath || "").trim().replace(/^\/+/u, "");
  const match = normalizedRequestPath.match(/^mod\/([^/]+)\/([^/]+)\/(.+)$/u);

  if (!match) {
    return "";
  }

  const [, authorId, repositoryId, rawModulePath] = match;
  const modulePath = String(rawModulePath || "")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");

  if (!modulePath) {
    return "";
  }

  if (modulePath === "view.html") {
    return authorId === "_core" ? repositoryId : `${authorId}/${repositoryId}`;
  }

  if (modulePath.endsWith("/view.html")) {
    const featurePath = modulePath.slice(0, -"/view.html".length);
    return authorId === "_core"
      ? `${repositoryId}/${featurePath}`
      : `${authorId}/${repositoryId}/${featurePath}`;
  }

  return authorId === "_core"
    ? `${repositoryId}/${modulePath}`
    : `${authorId}/${repositoryId}/${modulePath}`;
}

export function normalizePanelRoutePath(value) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return "";
  }

  if (/^\/?mod\//u.test(rawValue)) {
    return normalizeRoutePath(normalizeModuleRoutePath(rawValue));
  }

  return normalizeRoutePath(rawValue);
}

function parseManifestRequestPath(requestPath) {
  const normalizedRequestPath = String(requestPath || "").trim();
  const match = normalizedRequestPath.match(/^\/mod\/([^/]+)\/([^/]+)\/ext\/panels\/(.+\.(?:ya?ml))$/iu);

  if (!match) {
    return {
      id: normalizedRequestPath,
      manifestPath: normalizedRequestPath,
      modulePath: ""
    };
  }

  return {
    id: normalizedRequestPath,
    manifestPath: normalizedRequestPath,
    modulePath: `/mod/${match[1]}/${match[2]}`
  };
}

export function normalizePanelManifest(manifest = {}, options = {}) {
  const normalizedManifest =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? manifest
      : {};
  const routePath = normalizePanelRoutePath(
    normalizedManifest.path ?? normalizedManifest.route ?? normalizedManifest.href
  );

  if (!routePath) {
    throw new Error("Panel manifest is missing a valid path.");
  }

  const name = normalizePanelName(normalizedManifest.name ?? normalizedManifest.title);

  if (!name) {
    throw new Error("Panel manifest is missing a valid name.");
  }

  return {
    color: normalizePanelColor(
      normalizedManifest.color ??
      normalizedManifest.icon_color ??
      normalizedManifest.iconColor
    ),
    description: normalizePanelDescription(
      normalizedManifest.description ?? normalizedManifest.summary
    ),
    icon: normalizePanelIcon(normalizedManifest.icon),
    id: String(options.id || options.manifestPath || routePath),
    manifestPath: String(options.manifestPath || ""),
    modulePath: String(options.modulePath || ""),
    name,
    routePath
  };
}

async function listPanelManifestPaths() {
  const runtime = getRuntime();
  const response = await runtime.api.call("extensions_load", {
    body: {
      extension_point: PANEL_EXTENSION_POINT,
      filters: [...PANEL_EXTENSION_FILTERS]
    },
    method: "POST"
  });

  return Array.isArray(response?.extensions)
    ? response.extensions.filter((value) => typeof value === "string" && value.trim())
    : [];
}

export async function loadPanelManifest(manifestPath) {
  const runtime = getRuntime();
  const response = await fetch(manifestPath, {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw new Error(`Unable to read ${manifestPath}: ${response.status} ${response.statusText}`);
  }

  const manifestSource = await response.text();
  const parsedManifest = runtime.utils.yaml.parse(manifestSource);

  return normalizePanelManifest(parsedManifest, parseManifestRequestPath(manifestPath));
}

function comparePanels(left, right) {
  return left.name.localeCompare(right.name) || left.routePath.localeCompare(right.routePath);
}

export async function listPanels() {
  const manifestPaths = await listPanelManifestPaths();
  const panels = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      try {
        return await loadPanelManifest(manifestPath);
      } catch (error) {
        console.error(`[panels] loadPanelManifest failed for ${manifestPath}`, error);
        return null;
      }
    })
  );

  return panels.filter(Boolean).sort(comparePanels);
}
