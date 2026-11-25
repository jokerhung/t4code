import "~/index.css";
import { deriveLatestContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { ComposerContextUsage } from "./ComposerContextUsage";

import { resolveThreadDetailsLimits } from "./ThreadDetailsUsage.logic";
vi.mock(import("./ThreadDetailsUsage.logic"), async (original) => {
  const module = await original();
  return { ...module, resolveThreadDetailsLimits: vi.fn(module.resolveThreadDetailsLimits) };
});

const snapshot = (usedTokens: number, maxTokens?: number) =>
  deriveLatestContextWindowSnapshot([], {
    usedTokens,
    maxTokens,
    autoCompactThreshold: 90_000,
    updatedAt: "2026-11-25T00:00:00.000Z",
  });

it("opens used and remaining context token details", async () => {
  await using screen = await render(<ComposerContextUsage usage={snapshot(4_000, 100_000)} />);
  await screen.getByRole("button", { name: "Usage" }).click();
  const details = page.getByRole("dialog", { name: "Usage" });
  await expect.element(details.getByText("4% · 4k", { exact: true })).toBeVisible();
  await expect.element(details.getByText("96% · 96k", { exact: true })).toBeVisible();
  await expect.element(details.getByText("100k", { exact: true })).toBeVisible();
  await expect.element(details.getByText("90k", { exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(details).not.toBeInTheDocument();
});

it("updates context usage while the details remain open", async () => {
  await using screen = await render(<ComposerContextUsage usage={snapshot(4_000, 100_000)} />);
  await screen.getByRole("button").click();
  await screen.rerender(<ComposerContextUsage usage={snapshot(85_000, 100_000)} />);
  await expect
    .element(page.getByRole("dialog").getByText("15% · 15k", { exact: true }))
    .toBeVisible();
});

it("shows unavailable data instead of inventing a percentage", async () => {
  await using screen = await render(<ComposerContextUsage usage={null} />);
  await expect.element(screen.getByRole("button")).not.toHaveTextContent("0%");
  await screen.getByRole("button").click();
  await expect.element(page.getByText("Context usage has not been reported yet.")).toBeVisible();
});

it("keeps reported token usage when the context limit is unknown", async () => {
  await using screen = await render(<ComposerContextUsage usage={snapshot(4_000)} />);
  await expect.element(screen.getByRole("button")).not.toHaveTextContent("0%");
  await screen.getByRole("button").click();
  await expect.element(page.getByRole("dialog").getByText("– · 4k", { exact: true })).toBeVisible();
});

it("shows five-hour and weekly used and remaining percentages with reset times", async () => {
  vi.mocked(resolveThreadDetailsLimits).mockReturnValue({
    kind: "instance",
    limits: {
      checkedAt: "2026-11-25T00:00:00.000Z",
      windows: [
        {
          id: "five_hour",
          label: "Session",
          kind: "session",
          windowDurationMins: 300,
          usedPercent: 35,
          resetsAt: "2027-01-01T05:00:00Z",
        },
        {
          id: "weekly",
          label: "Weekly",
          kind: "weekly",
          usedPercent: 20,
          resetsAt: "2027-01-07T00:00:00Z",
        },
      ],
    },
  });
  await using screen = await render(
    <ComposerContextUsage
      usage={null}
      limits={{ providerInstanceId: null, model: null, providers: [], sources: [] }}
    />,
  );
  const trigger = screen.getByRole("button", { name: "5-hour limit: 35% used, 65% remaining" });
  await expect.element(trigger).toHaveTextContent("35%");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Usage" });
  await expect.element(dialog.getByText("5-hour limit", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Weekly · all models", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByRole("progressbar", { name: "5-hour limit" }))
    .toHaveAttribute("aria-valuenow", "35");
  await expect
    .element(dialog.getByRole("progressbar", { name: "Weekly · all models" }))
    .toHaveAttribute("aria-valuetext", "20% used, 80% remaining");
  await expect.element(dialog.getByText(/^Resets /).first()).toBeVisible();
});
