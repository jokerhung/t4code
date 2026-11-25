import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { remainingPercent } from "@t3tools/shared/usageLimits";
import { useNowMinute } from "../../hooks/useNowMinute";
import { resolveThreadDetailsLimits, nextPoolReset } from "./ThreadDetailsUsage.logic";
import type { ThreadDetailsUsageInput } from "./ThreadDetailsUsage";
import { useGT, useLocale } from "gt-react";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { composerFloatingLayerProps } from "./composerEventScope";

export function ComposerContextUsage({
  usage,
  limits,
  size = "xs",
}: {
  usage: ContextWindowSnapshot | null;
  limits?: Omit<ThreadDetailsUsageInput, "contextWindow"> | undefined;
  size?: ComposerControlSize;
}) {
  const gt = useGT();
  const locale = useLocale();
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const resolved = limits
    ? resolveThreadDetailsLimits(
        limits.providerInstanceId,
        limits.model,
        limits.providers,
        limits.sources,
        now,
      )
    : null;
  const windows =
    resolved?.kind === "instance"
      ? resolved.limits.windows.map((window) => ({
          id: window.id,
          label:
            window.windowDurationMins === 300
              ? gt("5-hour limit")
              : window.label === "Weekly"
                ? gt("Weekly ? all models")
                : window.label,
          left: remainingPercent(window),
          fiveHour: window.windowDurationMins === 300,
          resetsAt: window.resetsAt,
        }))
      : (resolved?.windows.map((window) => ({
          id: window.id,
          label: window.label,
          left: window.remainingPercent,
          fiveHour: window.members.some((member) => member.window.windowDurationMins === 300),
          resetsAt: nextPoolReset(window, now)?.member.window.resetsAt,
        })) ?? []);

  const resetLabel = (value: string | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    const reset = new Date(value);
    const today = reset.toDateString() === new Date(now).toDateString();
    const time = new Intl.DateTimeFormat(locale, {
      ...(today ? {} : { weekday: "short" as const }),
      hour: "numeric",
      minute: "2-digit",
    }).format(reset);
    return today ? gt("Resets at {time}", { time }) : gt("Resets {time}", { time });
  };
  const used =
    usage?.usedPercentage != null && Number.isFinite(usage.usedPercentage)
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const remaining = used === null ? null : 100 - used;
  const fiveHour = windows.find((window) => window.fiveHour);
  const sessionUsed = fiveHour ? Math.round(Math.max(0, Math.min(100, 100 - fiveHour.left))) : null;
  const label =
    sessionUsed === null
      ? gt("Usage")
      : gt("5-hour limit: {used}% used, {remaining}% remaining", {
          used: sessionUsed,
          remaining: 100 - sessionUsed,
        });
  const tokens = (value: number | null | undefined) =>
    value == null ? "–" : formatContextWindowTokens(value);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <ComposerControl
            size={size}
            aria-label={label}
            data-composer-context-control
            className="shrink-0"
          />
        }
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3.5 shrink-0 -rotate-90"
          fill="none"
          strokeWidth="2"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" className="text-border" />
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            pathLength="100"
            strokeDasharray={`${sessionUsed ?? 0} ${100 - (sessionUsed ?? 0)}`}
            className={
              sessionUsed !== null && sessionUsed >= 90
                ? "text-error"
                : sessionUsed !== null && sessionUsed >= 80
                  ? "text-warning"
                  : "text-muted-foreground"
            }
          />
        </svg>
        <span className="text-xs tabular-nums">
          {sessionUsed === null ? "–" : `${sessionUsed}%`}
        </span>
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" width="md" {...composerFloatingLayerProps}>
        <div className="space-y-3">
          <PopoverTitle>{gt("Usage")}</PopoverTitle>
          <section
            className="space-y-3 border-b border-border pb-3"
            aria-label={gt("Usage limits")}
          >
            <h3 className="sr-only">{gt("Usage limits")}</h3>
            {windows.length ? (
              windows.map((window) => {
                const used = Math.round(Math.max(0, Math.min(100, 100 - window.left)));
                return (
                  <div key={window.id} className="space-y-1 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{window.label}</span>
                      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                        {resetLabel(window.resetsAt)}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{used}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={window.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={used}
                      aria-valuetext={gt("{used}% used, {remaining}% remaining", {
                        used,
                        remaining: 100 - used,
                      })}
                      className="h-1 overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${used}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                {gt("Usage limits are not available for this provider.")}
              </p>
            )}
          </section>
          <h3 className="text-xs font-medium">{gt("Context window")}</h3>
          {usage ? <p className="text-xs text-muted-foreground">{gt("Token usage")}</p> : null}
          {usage ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs tabular-nums">
              <dt className="text-muted-foreground">{gt("Used")}</dt>
              <dd>
                {used === null ? "–" : `${used}%`} · {tokens(usage.usedTokens)}
              </dd>
              <dt className="text-muted-foreground">{gt("Remaining")}</dt>
              <dd>
                {remaining === null ? "–" : `${remaining}%`} · {tokens(usage.remainingTokens)}
              </dd>
              <dt className="text-muted-foreground">{gt("Context limit")}</dt>
              <dd>{tokens(usage.maxTokens)}</dd>
              {usage.autoCompactThreshold != null && usage.autoCompactThreshold > 0 ? (
                <>
                  <dt className="text-muted-foreground">{gt("Auto-compaction")}</dt>
                  <dd>{tokens(usage.autoCompactThreshold)}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {gt("Context usage has not been reported yet.")}
            </p>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
