import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Guide 8.3 checklist: no link in the app points at a missing route. Every internal href, push,
// replace and redirect in the frontend, and every notification link the API sends, must match a
// page under app/.

const ROOT = process.cwd();

function walk(dir: string, keep: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, keep);
    return keep(path) ? [path] : [];
  });
}

// app/sellers/orders/[id]/page.tsx -> ["sellers", "orders", "*"]; route groups like (rider) vanish
const routes = walk(join(ROOT, "app"), (f) => f.endsWith(`${sep}page.tsx`)).map((file) =>
  relative(join(ROOT, "app"), file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) ? "*" : s)),
);

// A link segment built from a template (`${role}s`) can be anything, like a route's [id]
const TEMPLATED = "\u0000";
const matches = (route: string[], path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.length === route.length && route.every((r, i) => r === "*" || segments[i] === r || segments[i].includes(TEMPLATED));
};

const LINK = /(?:href\s*[=:]\s*\{?\s*|\.push\(\s*|\.replace\(\s*|redirect\(\s*|link:\s*)(["'`])(\/[^"'`\s]*)\1/g;

function linksIn(files: string[]) {
  return files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(LINK)].map((m) => ({
      file: relative(ROOT, file),
      // A template's ${...} stands for one path segment; the query and hash don't pick the page
      path: m[2].replace(/\$\{[^}]*\}/g, TEMPLATED).split(/[?#]/)[0],
    })),
  );
}

const isSource = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f);
const frontend = [...walk(join(ROOT, "app"), isSource), ...walk(join(ROOT, "lib"), isSource), join(ROOT, "proxy.ts")];
const backend = walk(join(ROOT, "backend", "src"), isSource);

describe("internal links", () => {
  it("finds the app's links and routes", () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(linksIn(frontend).length).toBeGreaterThan(50);
  });

  it("every link in the frontend and every notification link from the API has a page", () => {
    const missing = [...linksIn(frontend), ...linksIn(backend)].filter((l) => !routes.some((r) => matches(r, l.path)));
    expect(missing).toEqual([]);
  });
});
