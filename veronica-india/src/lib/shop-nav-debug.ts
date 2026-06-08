/** Dev-only logging for Shop nav category loading. */
export function logShopNav(stage: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  if (detail === undefined) {
    console.info(`[shop-nav] ${stage}`);
    return;
  }
  console.info(`[shop-nav] ${stage}`, detail);
}
