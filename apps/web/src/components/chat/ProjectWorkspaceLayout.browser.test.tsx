import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import appCss from "../../index.css?inline";
import { render } from "../../../test/render";
import { ProjectWorkspaceLayout } from "./ProjectWorkspaceLayout";
import type { ProjectWorkspace } from "./useProjectWorkspace";
import type { WorkspaceSplit } from "./projectWorkspaceLayoutStore";

vi.mock(import("../../state/entities"), () => ({ useQuietThreadShell: () => null }));
vi.mock(import("../ThreadRouteView"), () => ({ useOpenThreadFamily: () => {} }));
vi.mock(import("./ProjectWorkspaceSurfaces"), () => ({
  ProjectWorkspaceSurfaces: () => [<div key="web">Web content</div>],
}));

function Harness() {
  const [split, setSplit] = useState<WorkspaceSplit | null>({
    target: { kind: "surface", surfaceId: "browser:test" },
    direction: "right",
    ratio: 50,
  });
  const workspace: ProjectWorkspace = {
    savedSplit: split,
    suspendSplit: vi.fn(),
    restoreSplit: vi.fn(() => null),
    split,
    splitTab: (target, direction) => setSplit({ target, direction, ratio: 50 }),
    focusSplit: vi.fn(),
    closeSplit: () => setSplit(null),
    resizeSplit: (ratio) => setSplit((value) => value && { ...value, ratio }),
    owner: null,
    projectRef: null,
    activeSurface: null,
    surfaces: [{ id: "browser:test", kind: "preview", resourceId: "test" }],
    shortcuts: {},
    browserAvailable: true,
    terminalAvailable: true,
    openingBrowser: false,
    addBrowser: async () => {},
    addTerminal: () => {},
    splitTerminal: () => {},
    closeTerminal: () => {},
    closeSurface: () => {},
    selectSurface: () => null,
    showThread: () => {},
    activateTerminal: () => {},
    surfaceTitle: () => "Web",
  };
  return (
    <>
      <style>{appCss}</style>
      <button
        onClick={() => setSplit((value) => value && { ...value, direction: "down", ratio: 50 })}
      >
        Change direction
      </button>
      <button onClick={() => setSplit(null)}>Remove split</button>
      <div style={{ width: 900, height: 600, display: "flex" }}>
        <ProjectWorkspaceLayout
          workspace={workspace}
          keybindings={[]}
          parentPanel={{
            hostRef: {
              environmentId: EnvironmentId.make("local"),
              threadId: ThreadId.make("thread"),
            },
            openToolDiff: () => {},
            runShellCommand: () => {},
          }}
          onAddTerminalContext={() => {}}
        >
          <div>Primary chat</div>
        </ProjectWorkspaceLayout>
      </div>
    </>
  );
}

it("resizes side-by-side panes by keyboard, changes direction and closes the split", async () => {
  await using screen = await render(<Harness />);
  await expect.element(screen.getByRole("button", { name: "Split down" })).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Close split" })).not.toBeInTheDocument();
  const primary = screen.container.querySelector('[data-workspace-pane="primary"]')!;
  const secondary = screen.container.querySelector('[data-workspace-pane="secondary"]')!;
  expect(
    Math.abs(primary.getBoundingClientRect().width - secondary.getBoundingClientRect().width),
  ).toBeLessThan(2);
  const separator = screen.getByRole("separator", { name: "Resize split" });
  await separator.click();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(separator).toHaveAttribute("aria-valuenow", "55");
  expect(primary.getBoundingClientRect().width).toBeGreaterThan(
    secondary.getBoundingClientRect().width,
  );
  await screen.getByRole("button", { name: "Change direction" }).click();
  await expect.element(separator).toHaveAttribute("aria-orientation", "horizontal");
  expect(
    Math.abs(primary.getBoundingClientRect().height - secondary.getBoundingClientRect().height),
  ).toBeLessThan(2);
  await screen.getByRole("button", { name: "Remove split" }).click();
  await expect.element(separator).not.toBeInTheDocument();
  expect(primary.getBoundingClientRect().width).toBe(900);
  await expect.element(screen.getByText("Primary chat")).toBeVisible();
});
