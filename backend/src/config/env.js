import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvFile(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.hasOwn(process.env, key)) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const parsed = parseEnvFile(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  return true;
}

function loadProjectEnv() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(currentDir, "../../../.env"),
  ];

  for (const candidate of candidates) {
    if (loadEnvFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

export { loadProjectEnv };
