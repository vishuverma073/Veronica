/** Dev-only logging for admin category ↔ product panel sync. */
export function logCategoryPanel(stage: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  if (detail === undefined) {
    console.info(`[category-panel] ${stage}`);
    return;
  }
  console.info(`[category-panel] ${stage}`, detail);
}
