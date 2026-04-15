#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { listFiles, readUpdateMetadata, readYamlScalar } = require("./release-metadata");

const FILTERS_PATH = path.join(__dirname, "..", "release-asset-filters.yaml");
const METADATA_SPECS = [
  { fileName: "metadata-latest-windows.yml", platform: "windows", legacyNames: ["latest.yml"] },
  { fileName: "metadata-latest-mac.yml", platform: "macos", legacyNames: ["latest-mac.yml"] },
  { fileName: "metadata-latest-linux.yml", platform: "linux", arch: "x64", legacyNames: ["latest-linux.yml"] },
  { fileName: "metadata-latest-linux-arm64.yml", platform: "linux", arch: "arm64", legacyNames: ["latest-linux-arm64.yml"] }
];
const PUBLIC_EXTENSION_MAP = {
  AppImage: "AppImage",
  dmg: "dmg",
  exe: "exe"
};

function parseArgs(argv) {
  const assetsDir = argv[0] || "release-assets";
  const outputDir = argv[1] || "release-upload";
  const releaseVersion = String(argv[2] || "").trim();

  if (!releaseVersion) {
    throw new Error(
      "Usage: node packaging/scripts/release-assets-stage.js <release-assets-dir> <output-dir> <release-version>"
    );
  }

  return {
    assetsDir: path.resolve(assetsDir),
    outputDir: path.resolve(outputDir),
    releaseVersion
  };
}

function ensureDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/gu, "/");
}

function escapeRegExp(value) {
  const specials = new Set(["\\", ".", "+", "*", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]"]);
  return Array.from(String(value || ""))
    .map((character) => (specials.has(character) ? "\\" + character : character))
    .join("");
}

function globPatternToRegExp(pattern) {
  const normalized = toPosixPath(pattern);
  const regexBody = normalized.split("*").map(escapeRegExp).join("[^/]*");
  return new RegExp("^" + regexBody + "$", "u");
}

function readReleaseUploadPatterns(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*pattern:\s*(.+)\s*$/u))
    .filter(Boolean)
    .map((match) => readYamlScalar(match[1]));
}

function inferPlatformArch(relativePath) {
  const artifactDir = toPosixPath(relativePath).split("/")[0];
  const match = artifactDir && artifactDir.match(/^(linux|macos|windows)-(x64|arm64)$/u);
  if (!match) {
    return null;
  }

  return {
    artifactDir,
    platform: match[1],
    arch: match[2]
  };
}

function detectFileKind(fileName) {
  const name = String(fileName || "");

  if (name.endsWith(".zip.blockmap")) {
    return { kind: "zip.blockmap", extension: "zip.blockmap", baseExtension: "zip" };
  }
  if (name.endsWith(".dmg.blockmap")) {
    return { kind: "dmg.blockmap", extension: "dmg.blockmap", baseExtension: "dmg" };
  }
  if (name.endsWith(".exe.blockmap")) {
    return { kind: "exe.blockmap", extension: "exe.blockmap", baseExtension: "exe" };
  }
  if (name.endsWith(".AppImage")) {
    return { kind: "AppImage", extension: "AppImage", baseExtension: "AppImage" };
  }
  if (name.endsWith(".tar.gz")) {
    return { kind: "tar.gz", extension: "tar.gz", baseExtension: "tar.gz" };
  }
  if (name.endsWith(".dmg")) {
    return { kind: "dmg", extension: "dmg", baseExtension: "dmg" };
  }
  if (name.endsWith(".zip")) {
    return { kind: "zip", extension: "zip", baseExtension: "zip" };
  }
  if (name.endsWith(".deb")) {
    return { kind: "deb", extension: "deb", baseExtension: "deb" };
  }
  if (name.endsWith(".exe")) {
    return { kind: "exe", extension: "exe", baseExtension: "exe" };
  }
  if (name.endsWith(".yml")) {
    return { kind: "yml", extension: "yml", baseExtension: "yml" };
  }

  return null;
}

function buildArtifactIndex(rootDir) {
  return listFiles(rootDir)
    .map((filePath) => {
      const relativePath = toPosixPath(path.relative(rootDir, filePath));
      const owner = inferPlatformArch(relativePath);
      const detected = detectFileKind(path.basename(filePath));
      if (!owner || !detected) {
        return null;
      }

      return {
        path: filePath,
        relativePath,
        basename: path.basename(filePath),
        size: fs.statSync(filePath).size,
        artifactDir: owner.artifactDir,
        platform: owner.platform,
        arch: owner.arch,
        kind: detected.kind,
        extension: detected.extension,
        baseExtension: detected.baseExtension
      };
    })
    .filter(Boolean);
}

function createStageContext(outputDir) {
  return {
    outputDir,
    staged: new Map(),
    staleAssetNames: new Set()
  };
}

function stageFile(context, sourcePath, targetName) {
  if (!targetName) {
    throw new Error("Cannot stage " + sourcePath + " without a target name.");
  }

  const existing = context.staged.get(targetName);
  if (existing) {
    if (existing.sourcePath !== sourcePath) {
      throw new Error(
        "Duplicate staged asset name " + targetName + " from " + existing.sourcePath + " and " + sourcePath + "."
      );
    }
    return existing.outputPath;
  }

  const outputPath = path.join(context.outputDir, targetName);
  try {
    fs.linkSync(sourcePath, outputPath);
  } catch (_error) {
    fs.copyFileSync(sourcePath, outputPath);
  }

  context.staged.set(targetName, {
    sourcePath,
    outputPath,
    targetName
  });
  context.staleAssetNames.add(targetName);
  return outputPath;
}

function addSourceStaleBasename(context, artifactDir, basename) {
  context.staleAssetNames.add(basename);
  context.staleAssetNames.add(artifactDir + "-" + basename);
}

function addSourceStaleNames(context, record) {
  addSourceStaleBasename(context, record.artifactDir, record.basename);
}

function stagePublicReleaseAssets(releaseVersion, context, artifactIndex) {
  const patterns = readReleaseUploadPatterns(FILTERS_PATH).map((pattern) => ({
    pattern,
    regex: globPatternToRegExp(pattern)
  }));

  artifactIndex.forEach((record) => {
    const relativeToCwd = toPosixPath(path.relative(process.cwd(), record.path));
    if (!patterns.some((entry) => entry.regex.test(relativeToCwd))) {
      return;
    }

    const publicExtension = PUBLIC_EXTENSION_MAP[record.baseExtension];
    if (!publicExtension) {
      throw new Error("No public release asset mapping is configured for " + record.relativePath + ".");
    }

    const targetName =
      "Space-Agent-" + releaseVersion + "-" + record.platform + "-" + record.arch + "." + publicExtension;
    stageFile(context, record.path, targetName);
    addSourceStaleNames(context, record);
    console.log(relativeToCwd + " -> " + targetName);
  });
}

function detectArchHint(value) {
  const text = String(value || "");
  if (/arm64/u.test(text)) {
    return "arm64";
  }
  if (/x64/u.test(text)) {
    return "x64";
  }
  return "";
}

function matchMetadataAsset(platformFiles, metadataFileName, metadataEntry) {
  const requestedUrl = String(metadataEntry.url || "").trim();
  const targetExtensionInfo = detectFileKind(requestedUrl);
  if (!targetExtensionInfo) {
    throw new Error("Could not infer file type for " + requestedUrl + " in " + metadataFileName + ".");
  }

  let candidates = platformFiles.filter((file) => file.baseExtension === targetExtensionInfo.baseExtension);

  const exactNameMatches = candidates.filter((file) => file.basename === requestedUrl);
  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }
  if (exactNameMatches.length > 1) {
    candidates = exactNameMatches;
  }

  const archHint = detectArchHint(requestedUrl);
  if (archHint) {
    const archMatches = candidates.filter((file) => file.arch === archHint);
    if (archMatches.length) {
      candidates = archMatches;
    }
  }

  const targetSize = Number(metadataEntry.size);
  if (Number.isFinite(targetSize) && targetSize > 0) {
    const sizeMatches = candidates.filter((file) => file.size === targetSize);
    if (sizeMatches.length) {
      candidates = sizeMatches;
    }
  }

  if (candidates.length !== 1) {
    throw new Error(
      "Could not match updater asset " + requestedUrl + " from " + metadataFileName + " to one packaged file."
    );
  }

  return candidates[0];
}

function stageUpdaterMetadataAssets(rootDir, context, artifactIndex) {
  METADATA_SPECS.forEach((spec) => {
    const metadataPath = path.join(rootDir, spec.fileName);
    if (!fs.existsSync(metadataPath)) {
      return;
    }

    const metadata = readUpdateMetadata(metadataPath);
    const platformFiles = artifactIndex.filter((record) => {
      if (record.platform !== spec.platform) {
        return false;
      }
      if (record.kind.endsWith(".blockmap")) {
        return false;
      }
      if (spec.arch && record.arch !== spec.arch) {
        return false;
      }
      return true;
    });

    stageFile(context, metadataPath, spec.fileName);
    context.staleAssetNames.add(spec.fileName);
    spec.legacyNames.forEach((legacyName) => {
      context.staleAssetNames.add(legacyName);
    });

    metadata.files.forEach((metadataEntry) => {
      const matched = matchMetadataAsset(platformFiles, spec.fileName, metadataEntry);
      stageFile(context, matched.path, metadataEntry.url);
      addSourceStaleNames(context, matched);
      context.staleAssetNames.add(metadataEntry.url);
      console.log(toPosixPath(path.relative(process.cwd(), matched.path)) + " -> " + metadataEntry.url);

      const blockmapPath = matched.path + ".blockmap";
      if (fs.existsSync(blockmapPath)) {
        const blockmapName = metadataEntry.url + ".blockmap";
        stageFile(context, blockmapPath, blockmapName);
        addSourceStaleBasename(context, matched.artifactDir, path.basename(blockmapPath));
        context.staleAssetNames.add(blockmapName);
      }
    });
  });
}

function writeManifest(context) {
  const manifestPath = path.join(context.outputDir, ".manifest.json");
  const manifest = {
    staleAssetNames: Array.from(context.staleAssetNames).sort(),
    uploadFiles: Array.from(context.staged.values())
      .map((entry) => entry.outputPath)
      .sort()
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(parsed.assetsDir)) {
    throw new Error("Release assets directory does not exist: " + parsed.assetsDir);
  }

  ensureDirectory(parsed.outputDir);

  const artifactIndex = buildArtifactIndex(parsed.assetsDir);
  const context = createStageContext(parsed.outputDir);

  stagePublicReleaseAssets(parsed.releaseVersion, context, artifactIndex);
  stageUpdaterMetadataAssets(parsed.assetsDir, context, artifactIndex);

  const manifestPath = writeManifest(context);
  console.log("Wrote release upload manifest to " + manifestPath + ".");
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
