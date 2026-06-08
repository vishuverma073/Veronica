"use client";

import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { SettingsSchema, type Settings } from "@veronica/contracts";
import { useSettings } from "@/lib/admin-hooks";
import { adminApi } from "@/lib/admin-api";
import { useSWRConfig } from "swr";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const { mutate } = useSWRConfig();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Settings>({
    resolver: zodResolver(SettingsSchema) as unknown as Resolver<Settings>,
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  useUnsavedChangesGuard(isDirty);

  async function onSubmit(values: Settings) {
    try {
      // `updatedAt` is server-managed — don't send it back on save.
      const { updatedAt: _ignored, ...patch } = values;
      const saved = await adminApi.updateSettings(patch);
      await mutate(["admin/settings"], saved, { revalidate: false });
      reset(saved);
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl py-20 text-center">
        <p className="text-sm text-danger mb-3">Couldn’t load settings.</p>
        <button type="button" onClick={() => void mutate(["admin/settings"])} className="btn btn-secondary text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl pb-24">
      <h1 className="text-xl font-bold text-text-primary mb-5">Settings</h1>

      <div className="bg-white rounded-xl border border-border-light shadow-sm p-4 space-y-4">
        <Field label="Store name" error={errors.storeName?.message}>
          <input {...register("storeName")} className="input" />
        </Field>
        <Field label="Support phone" error={errors.supportPhone?.message}>
          <input {...register("supportPhone")} className="input" />
        </Field>
        <Field label="Support email" error={errors.supportEmail?.message}>
          <input {...register("supportEmail")} className="input" type="email" />
        </Field>
        <Field label="WhatsApp number (E.164)" error={errors.whatsappNumber?.message}>
          <input {...register("whatsappNumber")} className="input" placeholder="+919350529717" />
        </Field>
        <div className="pt-1">
          <p className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-2">Store address</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Address line 1">
                <input {...register("storeAddress.line1")} className="input" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address line 2">
                <input {...register("storeAddress.line2")} className="input" />
              </Field>
            </div>
            <Field label="City">
              <input {...register("storeAddress.city")} className="input" />
            </Field>
            <Field label="State">
              <input {...register("storeAddress.state")} className="input" />
            </Field>
            <Field label="Pincode">
              <input {...register("storeAddress.pincode")} className="input" />
            </Field>
            <Field label="Landmark">
              <input {...register("storeAddress.landmark")} className="input" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="GST rate (%)" error={errors.gstRate?.message}>
            <input {...register("gstRate", { valueAsNumber: true })} className="input" type="number" step="0.01" />
          </Field>
          <Field label="Free shipping above (₹)" error={errors.shippingFreeAbove?.message}>
            <input {...register("shippingFreeAbove", { valueAsNumber: true })} className="input" type="number" />
          </Field>
          <Field label="Shipping fee (₹)" error={errors.shippingFlatFee?.message}>
            <input {...register("shippingFlatFee", { valueAsNumber: true })} className="input" type="number" />
          </Field>
        </div>
      </div>

      <div
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0 inset-x-0 lg:left-60 z-40 bg-white border-t border-border px-4 pt-3 pb-3 lg:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex items-center justify-between"
      >
        <span className="text-xs text-text-muted">
          {isSubmitting ? "Saving…" : isDirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          <Save size={15} /> Save
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="input-label">{label}</label>
      {children}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
