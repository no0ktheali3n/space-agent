#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { listFiles, mergeMetadataFiles } = require("./release-metadata");

const CANONICAL_METADATA_SPECS = [
  { fileName: "metadata-latest-windows.yml", platform: "windows", merge: true },
  { fileName: "metadata-latest-mac.yml", platform: "macos", merge: true },
  { fileName: "metadata-latest-linux.yml", platform: "linux", merge: false },
  { fileName: "metadata-latest-linux-arm64.yml", platform: "linux", merge: false }
];

function toPosixPath(value) {
  return String(value || "").replace(/\\/gu, "/");
}

function collectMetadataFiles(rootDir, files, spec) {
  const platformDirPattern = new RegExp("^" + spec.platform + "-(x64|arm64)/", "u");
  return files
    .filter((filePath) => path.basename(filePath) === spec.fileName)
    .filter((filePath) => platformDirPattern.test(toPosixPath(path.relative(rootDir, filePath))))
    .sort();
}

function copyCanonicalMetadata(inputPath, outputPath) {
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    return false;
  }

  fs.copyFileSync(inputPath, outputPath);
  return true;
}

function main() {
  const rootDir = path.resolve(process.argv[2] || "release-assets");
  if (!fs.existsSync(rootDir)) {
    throw new Error("Release assets directory does not exist: " + rootDir);
  }

  const files = listFiles(rootDir);

  CANONICAL_METADATA_SPECS.forEach((spec) => {
    const metadataFiles = collectMetadataFiles(rootDir, files, spec);
    if (!metadataFiles.length) {
      return;
    }

    const outputPath = path.join(rootDir, spec.fileName);

    if (spec.merge) {
      if (metadataFiles.length === 1) {
        if (copyCanonicalMetadata(metadataFiles[0], outputPath)) {
          console.log("Promoted " + metadataFiles[0] + " to " + outputPath + ".");
        }
        return;
      }

      mergeMetadataFiles(metadataFiles, outputPath);
      console.log(
        "Merged " + metadataFiles.length + " updater metadata file(s) into " + outputPath + "."
      );
      return;
    }

    if (metadataFiles.length !== 1) {
      throw new Error(
        "Expected exactly one " + spec.fileName + " file for " + spec.platform + ", found " + metadataFiles.length + "."
      );
    }

    if (copyCanonicalMetadata(metadataFiles[0], outputPath)) {
      console.log("Promoted " + metadataFiles[0] + " to " + outputPath + ".");
    }
  });
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
