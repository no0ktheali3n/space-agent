#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function listFiles(rootDir) {
  const files = [];

  function visit(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        return;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    });
  }

  visit(rootDir);
  return files;
}

function readYamlScalar(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readUpdateMetadata(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  const metadata = {
    files: []
  };
  let currentFile = null;

  lines.forEach((line) => {
    const rootMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (rootMatch) {
      const [, key, value] = rootMatch;
      if (key !== "files") {
        metadata[key] = readYamlScalar(value);
      }
      return;
    }

    const fileStartMatch = line.match(/^\s*-\s+url:\s*(.*)$/u);
    if (fileStartMatch) {
      currentFile = {
        url: readYamlScalar(fileStartMatch[1])
      };
      metadata.files.push(currentFile);
      return;
    }

    const fileFieldMatch = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (fileFieldMatch && currentFile) {
      currentFile[fileFieldMatch[1]] = readYamlScalar(fileFieldMatch[2]);
    }
  });

  return metadata;
}

function quoteYamlValue(value) {
  const text = String(value ?? "");

  if (/^[A-Za-z0-9._/@:+-]+$/u.test(text)) {
    return text;
  }

  return JSON.stringify(text);
}

function serializeUpdateMetadata(metadata) {
  const lines = [];
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const firstFile = files[0] || {};
  const pathValue = metadata.path || firstFile.url || "";
  const sha512Value = metadata.sha512 || firstFile.sha512 || "";

  if (metadata.version) {
    lines.push(`version: ${quoteYamlValue(metadata.version)}`);
  }

  lines.push("files:");
  files.forEach((file) => {
    lines.push(`  - url: ${quoteYamlValue(file.url)}`);
    Object.entries(file).forEach(([key, value]) => {
      if (key === "url") {
        return;
      }
      lines.push(`    ${key}: ${quoteYamlValue(value)}`);
    });
  });

  if (pathValue) {
    lines.push(`path: ${quoteYamlValue(pathValue)}`);
  }

  if (sha512Value) {
    lines.push(`sha512: ${quoteYamlValue(sha512Value)}`);
  }

  if (metadata.releaseDate) {
    lines.push(`releaseDate: ${quoteYamlValue(metadata.releaseDate)}`);
  }

  return `${lines.join("\n")}\n`;
}

function mergeMetadataFiles(inputFiles, outputPath) {
  const merged = {
    files: []
  };
  const seenUrls = new Set();

  inputFiles.forEach((filePath) => {
    const metadata = readUpdateMetadata(filePath);
    Object.entries(metadata).forEach(([key, value]) => {
      if (key !== "files" && merged[key] === undefined && value !== undefined && value !== "") {
        merged[key] = value;
      }
    });

    metadata.files.forEach((file) => {
      if (!file.url || seenUrls.has(file.url)) {
        return;
      }

      seenUrls.add(file.url);
      merged.files.push(file);
    });
  });

  if (!merged.files.length) {
    throw new Error(`No updater files found while merging ${path.basename(outputPath)}.`);
  }

  fs.writeFileSync(outputPath, serializeUpdateMetadata(merged), "utf8");
  return merged;
}

module.exports = {
  listFiles,
  mergeMetadataFiles,
  quoteYamlValue,
  readUpdateMetadata,
  readYamlScalar,
  serializeUpdateMetadata
};
