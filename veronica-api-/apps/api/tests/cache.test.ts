import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cached,
  invalidate,
  invalidatePrefix,
  invalidateProductCaches,
  __clearMemCache,
} from "../src/lib/cache.js";

beforeEach(() => __clearMemCache());

describe("cached() (in-memory fallback)", () => {
  it("misses then hits, calling the loader only once", async () => {
    const loader = vi.fn(async () => ({ n: 1 }));
    const first = await cached("k1", 300, loader);
    const second = await cached("k1", 300, loader);
    expect(first).toEqual({ value: { n: 1 }, hit: false });
    expect(second).toEqual({ value: { n: 1 }, hit: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache null (negative results re-run the loader)", async () => {
    const loader = vi.fn(async () => null);
    await cached("k2", 300, loader);
    await cached("k2", 300, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("invalidation", () => {
  it("invalidate() forces the next call to miss", async () => {
    const loader = vi.fn(async () => "v");
    await cached("k3", 300, loader);
    await invalidate("k3");
    await cached("k3", 300, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidatePrefix() clears every key under the prefix", async () => {
    await cached("category-products:a", 300, async () => 1);
    await cached("category-products:b", 300, async () => 2);
    await cached("product:x", 300, async () => 3);
    await invalidatePrefix("category-products:");

    const a = vi.fn(async () => 11);
    const x = vi.fn(async () => 33);
    await cached("category-products:a", 300, a); // cleared → miss
    await cached("product:x", 300, x); // untouched → hit
    expect(a).toHaveBeenCalledTimes(1);
    expect(x).toHaveBeenCalledTimes(0);
  });

  it("invalidateProductCaches() clears the product key and category lists", async () => {
    await cached("product:lav", 300, async () => "detail");
    await cached("category-products:sinks", 300, async () => "list");
    await cached("categories:root", 300, async () => "roots");
    await invalidateProductCaches("lav");

    const p = vi.fn(async () => "fresh");
    await cached("product:lav", 300, p);
    await cached("category-products:sinks", 300, vi.fn(async () => "x"));
    expect(p).toHaveBeenCalledTimes(1); // was invalidated
  });
});
