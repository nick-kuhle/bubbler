// scripts/check-i18n.ts — parity checks for messages/*.json against en.json.
//
// Run: `npm run i18n:check`
//
// Fails (exit 1) if any locale catalog:
//   - is missing a file, or contains keys en.json doesn't have (or vice versa)
//   - has a different array length (e.g. wizard.stepsShort)
//   - drops or invents ICU placeholders ({name}, {gems}, …) in a leaf string
//   - has a non-string leaf where en.json has a string
//
// This is the guardrail for hand edits AND for `npm run i18n` output — if a
// machine translation ever drops a `{placeholder}`, this catches it before a
// page explodes at runtime.

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { routing } from "../src/i18n/routing";

const MESSAGES_DIR = join(__dirname, "..", "messages");
const SOURCE = "en";

type Catalog = Record<string, unknown>;

function load(locale: string): Catalog {
  return JSON.parse(
    readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"),
  ) as Catalog;
}

/** Flatten to dot paths; arrays become "<path>[@]" with their length noted. */
function flatten(node: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Catalog)) {
      for (const [p, val] of flatten(v, prefix ? `${prefix}.${k}` : k)) {
        out.set(p, val);
      }
    }
  } else {
    out.set(prefix, node);
  }
  return out;
}

/** Extract {placeholder} names from an ICU-ish string, sorted. */
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

const problems: string[] = [];
const expected = new Set<string>(routing.locales);
const files = new Set(
  readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => basename(f, ".json")),
);

for (const loc of expected) {
  if (!files.has(loc)) problems.push(`missing file: messages/${loc}.json`);
}
for (const f of files) {
  if (!expected.has(f as (typeof routing.locales)[number])) {
    problems.push(`stray file not in routing.locales: messages/${f}.json`);
  }
}

const ref = flatten(load(SOURCE));

for (const loc of routing.locales) {
  if (loc === SOURCE || !files.has(loc)) continue;
  let cat: Catalog;
  try {
    cat = load(loc);
  } catch {
    problems.push(`${loc}: invalid JSON`);
    continue;
  }
  const flat = flatten(cat);

  for (const [path, refVal] of ref) {
    if (!flat.has(path)) {
      problems.push(`${loc}: missing key ${path}`);
      continue;
    }
    const val = flat.get(path);
    if (Array.isArray(refVal)) {
      if (!Array.isArray(val) || val.length !== refVal.length) {
        problems.push(
          `${loc}: ${path} must be an array of ${refVal.length} items`,
        );
      }
      continue;
    }
    if (typeof refVal !== "string") continue; // en.json is the only type authority
    if (typeof val !== "string") {
      problems.push(`${loc}: ${path} should be a string`);
      continue;
    }
    const want = placeholders(refVal);
    const got = placeholders(val);
    if (want.join(",") !== got.join(",")) {
      problems.push(
        `${loc}: ${path} placeholders [${got.join(", ")}] ≠ en [${want.join(", ")}]`,
      );
    }
  }

  for (const path of flat.keys()) {
    if (!ref.has(path)) problems.push(`${loc}: extra key ${path} (not in en)`);
  }
}

if (problems.length) {
  console.error(`✗ i18n parity: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `✓ i18n parity: ${routing.locales.length} locales, ${ref.size} keys each, all placeholders intact.`,
);
