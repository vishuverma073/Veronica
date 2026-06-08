"use client";

import { Plus, Trash2, X, Tag } from "lucide-react";
import { useState } from "react";
import type { VariantDimension } from "@veronica/contracts";
import { syncSkus, tempId, type EditableSku } from "@/lib/sku-matrix";
import { formatPrice } from "@/lib/utils";

/** SKU row in the admin editor — price is null until the user enters one (0 is valid). */
export type { EditableSku };

interface VariantsEditorProps {
  dimensions: VariantDimension[];
  skus: EditableSku[];
  codePrefix: string;
  onChange: (dimensions: VariantDimension[], skus: EditableSku[]) => void;
}

export default function VariantsEditor({
  dimensions,
  skus,
  codePrefix,
  onChange,
}: VariantsEditorProps) {
  const [bulkPrice, setBulkPrice] = useState("");
  const hasVariants = dimensions.length > 0;

  /** Apply a dimension change and re-sync the SKU matrix. */
  function commit(nextDims: VariantDimension[], nextSkus?: EditableSku[]) {
    const synced = syncSkus(nextDims, nextSkus ?? skus, codePrefix);
    onChange(nextDims, synced);
  }

  function toggleVariants(on: boolean) {
    if (on) {
      commit([{ id: tempId(), name: "Size", sortOrder: 0, values: [] }]);
    } else {
      commit([]);
    }
  }

  function addDimension() {
    commit([
      ...dimensions,
      { id: tempId(), name: "", sortOrder: dimensions.length, values: [] },
    ]);
  }

  function updateDimensionName(dimId: number, name: string) {
    const oldName = dimensions.find((d) => d.id === dimId)?.name;
    const nextDims = dimensions.map((d) => (d.id === dimId ? { ...d, name } : d));
    // SKUs key their dimensionValues by dimension *name*, and syncSkus matches
    // existing SKUs to combinations by that key. Renaming a dimension would
    // otherwise orphan every SKU (key miss) and reset all entered prices — so
    // migrate the key on each SKU to preserve the prices already entered.
    if (oldName && oldName !== name) {
      const remapped = skus.map((s) => {
        if (!(oldName in s.dimensionValues)) return s;
        const { [oldName]: moved, ...rest } = s.dimensionValues;
        return { ...s, dimensionValues: { ...rest, [name]: moved } };
      });
      commit(nextDims, remapped);
    } else {
      commit(nextDims);
    }
  }

  function removeDimension(dimId: number) {
    commit(dimensions.filter((d) => d.id !== dimId));
  }

  function addValue(dimId: number, value: string) {
    const v = value.trim();
    if (!v) return;
    commit(
      dimensions.map((d) =>
        d.id === dimId
          ? { ...d, values: [...d.values, { id: tempId(), value: v, sortOrder: d.values.length }] }
          : d,
      ),
    );
  }

  function removeValue(dimId: number, valueId: number) {
    commit(
      dimensions.map((d) =>
        d.id === dimId ? { ...d, values: d.values.filter((x) => x.id !== valueId) } : d,
      ),
    );
  }

  function updateSku(id: number, patch: Partial<EditableSku>) {
    onChange(
      dimensions,
      skus.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function applyBulkPrice() {
    const price = Number(bulkPrice);
    if (!Number.isFinite(price) || price < 0) return;
    onChange(
      dimensions,
      skus.map((s) => ({ ...s, price })),
    );
    setBulkPrice("");
  }

  return (
    <div className="space-y-4">
      {/* Variants toggle */}
      <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          type="checkbox"
          checked={hasVariants}
          onChange={(e) => toggleVariants(e.target.checked)}
          className="w-4 h-4 accent-brand-orange"
        />
        This product has variants (Size, Weight, Color…)
      </label>

      {/* Dimensions */}
      {hasVariants && (
        <div className="space-y-3">
          {dimensions.map((dim) => (
            <DimensionRow
              key={dim.id}
              dim={dim}
              onName={(name) => updateDimensionName(dim.id, name)}
              onAddValue={(v) => addValue(dim.id, v)}
              onRemoveValue={(vid) => removeValue(dim.id, vid)}
              onRemove={() => removeDimension(dim.id)}
            />
          ))}
          <button
            type="button"
            onClick={addDimension}
            className="btn btn-ghost text-sm border border-dashed border-border w-full"
          >
            <Plus size={15} /> Add dimension
          </button>
        </div>
      )}

      {/* Bulk price */}
      {skus.length > 1 && (
        <div className="flex items-end gap-2 bg-surface-dim rounded-lg p-3">
          <div className="flex-1">
            <label className="input-label flex items-center gap-1">
              <Tag size={12} /> Set all prices (₹)
            </label>
            <input
              type="number"
              min={0}
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              className="input"
              placeholder="e.g. 2999"
            />
          </div>
          <button type="button" onClick={applyBulkPrice} className="btn btn-secondary text-sm">
            Apply
          </button>
        </div>
      )}

      {/* SKU matrix */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-2 font-semibold">SKU</th>
              {hasVariants && <th className="py-2 px-2 font-semibold">Variant</th>}
              <th className="py-2 px-2 font-semibold">Price ₹</th>
              <th className="py-2 px-2 font-semibold">Sale ₹</th>
              <th className="py-2 px-2 font-semibold">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {skus.map((sku) => (
              <tr key={sku.id}>
                <td className="py-2 pr-2">
                  <input
                    value={sku.skuCode}
                    onChange={(e) => updateSku(sku.id, { skuCode: e.target.value })}
                    className="input py-1.5 text-xs w-28"
                  />
                </td>
                {hasVariants && (
                  <td className="py-2 px-2 text-xs text-text-secondary whitespace-nowrap">
                    {Object.entries(sku.dimensionValues)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ") || "—"}
                  </td>
                )}
                <td className="py-2 px-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={sku.price ?? ""}
                    placeholder="Required"
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateSku(sku.id, {
                        price: raw === "" ? null : Number(raw),
                      });
                    }}
                    className="input py-1.5 text-xs w-24"
                  />
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={sku.salePrice ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        updateSku(sku.id, {
                          salePrice: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="input py-1.5 text-xs w-24"
                    />
                    {sku.salePrice != null && (
                      <button
                        type="button"
                        onClick={() => updateSku(sku.id, { salePrice: null })}
                        className="text-text-muted hover:text-danger"
                        aria-label="Clear sale price"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={sku.stock ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      updateSku(sku.id, {
                        stock: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="input py-1.5 text-xs w-20"
                    aria-label="Stock quantity"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {skus.length === 0 && (
          <p className="text-sm text-text-muted py-4 text-center">
            Add dimension values to generate SKUs.
          </p>
        )}
      </div>

      {skus.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {skus.length} SKU{skus.length !== 1 ? "s" : ""}
          {skus.some((s) => s.price != null) && (
            <>
              {" "}
              · from{" "}
              {formatPrice(
                Math.min(...skus.map((s) => s.salePrice ?? s.price).filter((p): p is number => p != null)),
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function DimensionRow({
  dim,
  onName,
  onAddValue,
  onRemoveValue,
  onRemove,
}: {
  dim: VariantDimension;
  onName: (name: string) => void;
  onAddValue: (value: string) => void;
  onRemoveValue: (valueId: number) => void;
  onRemove: () => void;
}) {
  const [newValue, setNewValue] = useState("");

  return (
    <div className="border border-border rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={dim.name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Dimension name (e.g. Size)"
          className="input py-1.5 text-sm flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-red-50"
          aria-label="Remove dimension"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {dim.values.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 bg-surface-dim text-text-secondary text-xs font-medium px-2 py-1 rounded-full"
          >
            {v.value}
            <button
              type="button"
              onClick={() => onRemoveValue(v.id)}
              className="text-text-muted hover:text-danger"
              aria-label={`Remove ${v.value}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddValue(newValue);
              setNewValue("");
            }
          }}
          placeholder="Add value, press Enter"
          className="input py-1.5 text-sm flex-1"
        />
        <button
          type="button"
          onClick={() => {
            onAddValue(newValue);
            setNewValue("");
          }}
          className="btn btn-secondary text-xs px-3"
        >
          Add
        </button>
      </div>
    </div>
  );
}
