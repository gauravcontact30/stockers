/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "app");
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(full);
      return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
    }),
  );
  return nested.flat();
}

function isClientModule(source: string): boolean {
  return /^\s*["']use client["'];/.test(source);
}

function privateEnvReads(source: string): string[] {
  const names = new Set<string>();
  const pattern = /process\.env(?:\.([A-Z0-9_]+)|\[['"`]([^'"`]+)['"`]\])/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? match[2] ?? "";
    if (name && !name.startsWith("NEXT_PUBLIC_")) names.add(name);
  }
  return [...names].sort();
}

describe("client environment boundary", () => {
  it("keeps unprefixed environment variables out of client components", async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(ROOT)) {
      const source = await fs.readFile(file, "utf8");
      if (!isClientModule(source)) continue;
      const privateReads = privateEnvReads(source);
      if (privateReads.length > 0) offenders.push(`${path.relative(process.cwd(), file)}: ${privateReads.join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });
});
