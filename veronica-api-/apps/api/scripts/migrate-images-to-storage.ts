/**
 * One-off migration: move locally-served product images into Supabase Storage.
 *
 * Today the seed images are static files in veronica-india/public/uploads/ and
 * the DB stores paths like "/uploads/products/sink-hero-1.png". This uploads
 * every local file into the public `product-images` bucket PRESERVING its path
 * (so /uploads/products/x.png → product-images/products/x.png) and then rewrites
 * the "/uploads/" prefix to the bucket's public URL across every image column.
 *
 * Because the path is preserved, the rewrite is a simple, idempotent prefix swap
 * and re-running is safe (uploads upsert; rewrites only touch rows still on
 * "/uploads/").
 *
 * Usage (from apps/api):
 *   tsx --env-file=.env scripts/migrate-images-to-storage.ts          # dry run
 *   tsx --env-file=.env scripts/migrate-images-to-storage.ts --apply  # do it
 *
 * Prereq: a PUBLIC bucket named "product-images" must exist in Supabase
 * (dashboard → Storage → New bucket → Public). SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY must be set (they already are in .env).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const BUCKET = "product-images";
const APPLY = process.argv.includes("--apply");

const UPLOADS_DIR =
  process.env.LOCAL_UPLOADS_DIR ??
  fileURLToPath(new URL("../../../../veronica-india/public/uploads/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

// Text columns "table.column" and jsonb columns that may embed "/uploads/..." URLs.
const TEXT_COLUMNS = [
  { table: "product_images", column: "url" },
  { table: "categories", column: "image_url" },
  { table: "order_items", column: "image_url" },
];
const JSONB_COLUMNS = [
  { table: "home_config", column: "sections" },
  { table: "settings", column: "store_address" },
];

function contentTypeFor(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot >= 0 && CONTENT_TYPES[name.slice(dot).toLowerCase()]) || "application/octet-stream";
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // dir missing → nothing to upload
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && !e.name.startsWith(".")) out.push(full);
  }
  return out;
}

async function uploadFile(baseUrl: string, serviceKey: string, key: string, bytes: Buffer, type: string) {
  const res = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": type,
      "x-upsert": "true", // overwrite so re-runs are safe
    },
    body: bytes,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`upload ${key} failed: ${res.status} ${detail}`);
  }
}

async function main() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

  const publicPrefix = `${baseUrl}/storage/v1/object/public/${BUCKET}/`;
  console.log(`Mode: ${APPLY ? "APPLY (will upload + update DB)" : "DRY RUN (no changes)"}`);
  console.log(`Local uploads dir: ${UPLOADS_DIR}`);
  console.log(`Target bucket:     ${BUCKET} @ ${baseUrl}`);
  console.log(`URL rewrite:       /uploads/  →  ${publicPrefix}\n`);

  // 1) Upload every local file, preserving its sub-path as the storage key.
  const files = await walk(UPLOADS_DIR);
  console.log(`Found ${files.length} local image file(s).`);
  if (APPLY) {
    let n = 0;
    for (const f of files) {
      const key = relative(UPLOADS_DIR, f).split(/[\\/]/).join("/"); // e.g. products/sink-hero-1.png
      const bytes = await readFile(f);
      await uploadFile(baseUrl, serviceKey, key, bytes, contentTypeFor(f));
      n++;
      if (n % 10 === 0 || n === files.length) console.log(`  uploaded ${n}/${files.length}`);
    }
  } else {
    for (const f of files.slice(0, 5)) console.log(`  would upload: ${relative(UPLOADS_DIR, f)}`);
    if (files.length > 5) console.log(`  …and ${files.length - 5} more`);
  }

  // 2) Rewrite DB references from "/uploads/..." to the bucket's public URL.
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    console.log("\nDB references still on /uploads/:");
    for (const { table, column } of TEXT_COLUMNS) {
      const [{ count }] = await sql.unsafe(
        `SELECT count(*)::int AS count FROM ${table} WHERE ${column} LIKE '/uploads/%'`,
      );
      console.log(`  ${table}.${column}: ${count}`);
      if (APPLY && count > 0) {
        await sql.unsafe(
          `UPDATE ${table} SET ${column} = replace(${column}, '/uploads/', $1) WHERE ${column} LIKE '/uploads/%'`,
          [publicPrefix],
        );
      }
    }
    for (const { table, column } of JSONB_COLUMNS) {
      const [{ count }] = await sql.unsafe(
        `SELECT count(*)::int AS count FROM ${table} WHERE ${column}::text LIKE '%/uploads/%'`,
      );
      console.log(`  ${table}.${column} (jsonb): ${count}`);
      if (APPLY && count > 0) {
        await sql.unsafe(
          `UPDATE ${table} SET ${column} = replace(${column}::text, '/uploads/', $1)::jsonb WHERE ${column}::text LIKE '%/uploads/%'`,
          [publicPrefix],
        );
      }
    }
  } finally {
    await sql.end();
  }

  console.log(
    APPLY
      ? "\n✅ Done. Images are in Supabase Storage and DB URLs updated. You can delete veronica-india/public/uploads/."
      : "\nDry run complete. Re-run with --apply to upload and update the DB.",
  );
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
