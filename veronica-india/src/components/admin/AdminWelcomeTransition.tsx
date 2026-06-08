"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  ADMIN_WELCOME_DEFAULT_MESSAGES,
  prefetchAdminDashboard,
  runWelcomeTiming,
} from "@/lib/admin-welcome";

export type AdminWelcomeTransitionProps = {
  /** Shown as “Welcome Back, {adminName}” unless `welcomeTitle` overrides the full heading. */
  adminName: string;
  /** Override the entire welcome heading (future announcements). */
  welcomeTitle?: string;
  /** Rotating / fallback status lines under the heading. */
  statusMessages?: readonly string[];
  /** Optional slot for future system status or announcements. */
  footerSlot?: React.ReactNode;
  onComplete: () => void;
  prefetch?: () => Promise<void>;
  minDurationMs?: number;
  targetDurationMs?: number;
  exitDurationMs?: number;
};

type Phase = "enter" | "hold" | "exit";

export default function AdminWelcomeTransition({
  adminName,
  welcomeTitle,
  statusMessages = ADMIN_WELCOME_DEFAULT_MESSAGES,
  footerSlot,
  onComplete,
  prefetch = prefetchAdminDashboard,
  exitDurationMs = 450,
}: AdminWelcomeTransitionProps) {
  const [phase, setPhase] = useState<Phase>("enter");
  const [statusIndex, setStatusIndex] = useState(0);

  const heading = welcomeTitle ?? `Welcome Back, ${adminName}`;
  const statusLine = statusMessages[statusIndex] ?? statusMessages[0] ?? "Loading…";

  const messagesKey = useMemo(() => statusMessages.join("|"), [statusMessages]);

  useEffect(() => {
    setPhase("enter");
    const enterTimer = setTimeout(() => setPhase("hold"), 80);
    return () => clearTimeout(enterTimer);
  }, [adminName, heading]);

  useEffect(() => {
    if (statusMessages.length <= 1) return;
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % statusMessages.length);
    }, 1400);
    return () => clearInterval(id);
  }, [messagesKey, statusMessages.length]);

  useEffect(() => {
    let cancelled = false;

    async function sequence() {
      try {
        await runWelcomeTiming(prefetch);
      } catch {
        /* Dashboard prefetch failure shouldn't block entry — shell will retry. */
      }
      if (cancelled) return;
      setPhase("exit");
      setTimeout(() => {
        if (!cancelled) onComplete();
      }, exitDurationMs);
    }

    void sequence();
    return () => {
      cancelled = true;
    };
  }, [prefetch, onComplete, exitDurationMs]);

  return (
    <div
      className={cn(
        "admin-welcome-screen fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-brand-black px-6",
        phase === "exit" && "admin-welcome-screen--exit",
      )}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "exit"}
    >
      <div className="admin-welcome-bg" aria-hidden />
      <div className="admin-welcome-glow admin-welcome-glow--left" aria-hidden />
      <div className="admin-welcome-glow admin-welcome-glow--right" aria-hidden />

      <div
        className={cn(
          "relative z-10 flex flex-col items-center text-center max-w-lg w-full",
          phase === "enter" && "admin-welcome-content--enter",
          phase === "hold" && "admin-welcome-content--hold",
          phase === "exit" && "admin-welcome-content--exit",
        )}
      >
        <div className="admin-welcome-logo-wrap mb-8">
          <Image
            src="/uploads/logo/logo.webp"
            alt="Veronica"
            width={72}
            height={72}
            priority
            className="admin-welcome-logo rounded-2xl"
          />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/40 mb-3 admin-welcome-eyebrow">
          Veronica Admin
        </p>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight admin-welcome-heading">
          {heading}
        </h1>

        <p
          key={statusLine}
          className="mt-4 text-sm sm:text-base text-white/55 admin-welcome-status"
        >
          {statusLine}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="admin-welcome-spinner" aria-hidden />
          <div className="admin-welcome-progress-track w-48 sm:w-56 h-0.5 rounded-full overflow-hidden bg-white/10">
            <div className="admin-welcome-progress-bar h-full rounded-full bg-brand-orange" />
          </div>
        </div>

        {footerSlot && (
          <div className="mt-8 text-xs text-white/35 max-w-sm admin-welcome-footer">{footerSlot}</div>
        )}

        {phase === "hold" && (
          <button
            type="button"
            onClick={() => {
              setPhase("exit");
              setTimeout(onComplete, exitDurationMs);
            }}
            className="mt-6 text-xs text-white/40 hover:text-white underline underline-offset-2"
          >
            Skip intro
          </button>
        )}
      </div>
    </div>
  );
}
