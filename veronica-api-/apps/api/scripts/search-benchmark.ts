/**
 * Search benchmark (Phase 6, Task 6.1).
 *
 * Measures the current /search endpoint against a fixed set of real-ish queries
 * — correct spellings, common typos, partial words — and prints a markdown table
 * (query, result count, top 3 names). Use it to decide whether Postgres FTS is
 * good enough or whether to move to Meilisearch (Task 6.1b).
 *
 * Requires the API running with a seeded catalog (≥ 50 SKUs):
 *   API_URL=http://localhost:8787 pnpm tsx apps/api/scripts/search-benchmark.ts
 */
const API_URL = process.env.API_URL ?? "http://localhost:8787";

const QUERIES = [
  // correct
  "sink",
  "faucet",
  "drain",
  "kitchen sink",
  "stainless steel",
  "single bowl",
  "tap",
  "basin",
  "waste coupling",
  "rustproof",
  // typos / variants
  "snik", // sink
  "facuet", // faucet
  "kichen", // kitchen
  "stainles", // stainless
  "draen", // drain
  "bsain", // basin
  "singl bowl", // single bowl
  "tapp", // tap
  "rust proof", // rustproof
  "imported", // brand/tag
];

interface SearchResponse {
  items: { name: string }[];
}

async function run(): Promise<void> {
  const rows: { query: string; count: number; top: string }[] = [];
  let withResults = 0;

  for (const q of QUERIES) {
    try {
      const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as SearchResponse;
      const count = body.items?.length ?? 0;
      if (count > 0) withResults++;
      rows.push({
        query: q,
        count,
        top: body.items.slice(0, 3).map((i) => i.name).join(", ") || "—",
      });
    } catch (err) {
      rows.push({ query: q, count: -1, top: `ERROR: ${(err as Error).message}` });
    }
  }

  console.log(`\n# Search benchmark (${API_URL})\n`);
  console.log("| Query | Results | Top 3 |");
  console.log("|---|---|---|");
  for (const r of rows) {
    console.log(`| \`${r.query}\` | ${r.count} | ${r.top} |`);
  }
  const pct = Math.round((withResults / QUERIES.length) * 100);
  console.log(`\n**${withResults}/${QUERIES.length} (${pct}%) returned ≥1 result.**`);
  console.log(pct >= 80 ? "→ Postgres FTS is sufficient." : "→ Consider Meilisearch (Task 6.1b).\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
