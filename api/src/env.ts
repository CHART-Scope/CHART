import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const localEnvFileCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "api/.env"),
];

loadLocalEnv();

export function loadLocalEnv(paths = localEnvFileCandidates) {
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    loadEnvFile(path);
    return path;
  }

  return null;
}

function loadEnvFile(path: string) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.name] !== undefined) {
      continue;
    }

    process.env[parsed.name] = parsed.value;
  }
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const name = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return null;
  }

  return {
    name,
    value: unquoteEnvValue(rawValue),
  };
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
