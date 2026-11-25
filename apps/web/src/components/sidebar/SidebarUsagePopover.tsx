import { useAtomValue } from "@effect/atom-react";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import {
  collectLimitAccounts,
  collectLimitPools,
  displayLimitWindows,
} from "@t3tools/shared/usageLimits";
import { T, useGT, useLocale } from "gt-react";
import { ChartNoAxesColumnIcon } from "lucide-react";
import { useState } from "react";

import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { nextPoolReset } from "../chat/ThreadDetailsUsage.logic";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { barColor } from "../usage/UsageLimits";
import { PROVIDER_PRESENTATION } from "../usage/usageProviders";

/** Quick read-only look at limits. Reset credits and history stay on the full Usage page. */
export function SidebarUsagePopover({ onViewDetails }: { onViewDetails: () => void }) {
  const gt = useGT();
  const [open, setOpen] = useState(false);
  const label = gt("Usage");

  return (
    <SidebarMenuItem className="shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger render={<SidebarMenuButton aria-label={label} size="icon" />}>
                <ChartNoAxesColumnIcon />
              </PopoverTrigger>
            }
          />
          <TooltipPopup side="top">{label}</TooltipPopup>
        </Tooltip>
        <PopoverPopup side="top" align="start" width="md">
          <div className="space-y-3">
            <PopoverTitle>{label}</PopoverTitle>
            <UsageLimitsSummary />
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setOpen(false);
                onViewDetails();
              }}
            >
              <T>View details</T>
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}

/** Mounts only while the popup is open, so a closed sidebar never subscribes to limits. */
function UsageLimitsSummary() {
  const gt = useGT();
  const locale = useLocale();
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [now, setNow] = useState(() => Date.now());

  // A ref callback runs once per opening, which is when stale limits need a refresh.
  const [refreshOnOpen] = useState(() => (node: HTMLDivElement | null) => {
    if (!node) return;
    void Promise.allSettled(
      Array.from(presentations, ([environmentId, presentation]) => {
        if (presentation.connection.phase !== "connected" || !presentation.serverConfig) return;
        return refreshUsageLimits(
          environmentId,
          () => refreshProviders({ environmentId, input: {} }),
          true,
        );
      }),
    ).then(() => setNow(Date.now()));
  });

  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  const time = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div ref={refreshOnOpen} className="space-y-3">
      {pools.length === 0 ? (
        <p className="text-xs text-muted-foreground">{gt("No usage limits available yet.")}</p>
      ) : (
        pools.map((pool) => (
          <section key={pool.driver} className="space-y-2">
            <h3 className="text-xs font-medium">
              {Object.values(PROVIDER_PRESENTATION).find(
                (provider) => provider.driverKind === pool.driver,
              )?.label ?? pool.driver}
            </h3>
            {displayLimitWindows(pool).map((window) => {
              const used = Math.round(Math.max(0, Math.min(100, 100 - window.remainingPercent)));
              const reset = nextPoolReset(window, now)?.member.window.resetsAt;
              return (
                <div key={window.id} className="space-y-1 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{window.label}</span>
                    {reset ? (
                      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                        {gt("Resets {time}", { time: time.format(new Date(reset)) })}
                      </span>
                    ) : null}
                    <span className="shrink-0 text-muted-foreground tabular-nums">{used}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={window.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={used}
                    className="h-1 overflow-hidden rounded-full bg-border"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${used}%`, backgroundColor: barColor(pool.driver) }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
