"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { adminApi, type AdminAuditEntry } from "@/lib/admin-api";

const RESOURCE_FILTERS = [
  { key: "", label: "All resources" },
  { key: "product", label: "Products" },
  { key: "category", label: "Categories" },
  { key: "order", label: "Orders" },
  { key: "settings", label: "Settings" },
  { key: "user", label: "Users" },
] as const;

export default function AuditPage() {
  const [resourceType, setResourceType] = useState("");
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(false);
      }
      try {
        const page = await adminApi.listAuditLog({
          cursor,
          resource_type: resourceType || undefined,
        });
        setEntries((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch {
        if (!append) {
          setEntries([]);
          setError(true);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [resourceType],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-text-primary mb-5">Audit Log</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {RESOURCE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setResourceType(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              resourceType === f.key
                ? "border-brand-orange text-brand-orange bg-brand-orange/5"
                : "border-border text-text-secondary hover:bg-surface-dim"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-danger">Couldn’t load the audit log.</p>
          <button type="button" onClick={() => void load()} className="btn btn-secondary text-sm">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((e) => (
            <AuditRow
              key={e.id}
              entry={e}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId((id) => (id === e.id ? null : e.id))}
            />
          ))}
          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load(nextCursor, true)}
              className="btn btn-secondary text-sm w-full mt-2"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-muted py-10 text-center">No audit entries yet.</p>
      )}
    </div>
  );
}

function AuditRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AdminAuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChanges = entry.changes != null;

  return (
    <div className="bg-white rounded-lg border border-border-light overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        <ScrollText size={16} className="text-text-muted mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            {entry.action}{" "}
            <span className="text-text-muted font-normal">
              on {entry.resourceType} #{entry.resourceId}
            </span>
          </p>
          <p className="text-[11px] text-text-muted">
            {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        {hasChanges && (
          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] font-semibold text-brand-orange shrink-0 flex items-center gap-0.5"
          >
            JSON
            <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />
          </button>
        )}
      </div>
      {expanded && hasChanges && (
        <pre className="text-[11px] bg-surface-dim border-t border-border-light p-3 overflow-x-auto text-text-secondary">
          {JSON.stringify(entry.changes, null, 2)}
        </pre>
      )}
    </div>
  );
}
