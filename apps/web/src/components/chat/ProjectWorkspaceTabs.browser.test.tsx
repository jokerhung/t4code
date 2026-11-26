import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import { ProjectWorkspaceTabs } from "./ProjectWorkspaceTabs";
import type { ProjectWorkspace } from "./useProjectWorkspace";

const showContextMenu = vi.hoisted(() => vi.fn());
vi.mock(import("../../localApi"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    readLocalApi: () => {
      const api = original.createLocalApi();
      return { ...api, contextMenu: { ...api.contextMenu, show: showContextMenu } };
    },
  };
});

// The hook's own test covers the thread entries; this stand-in shows the tabs' entries only.
vi.mock(import("../../hooks/useThreadActionMenu"), () => ({
  useThreadActionMenu: () => ({
    openMenu: (position, source, options) => {
      void showContextMenu(options?.extra?.items, position, source).then(
        (action: string | undefined) => action && options?.extra?.onSelect(action),
      );
    },
    closeMenu: () => {},
  }),
}));
vi.mock(import("../../state/use-orchestration-command"), () => ({
  useOrchestrationCommand: () => vi.fn(),
}));

const data = vi.hoisted(() => ({ threads: [] as ReturnType<typeof makeThreadFixture>[] }));
vi.mock(import("../../state/entities"), () => ({ useQuietThreadShells: () => data.threads }));
vi.mock(import("../../state/session"), () => ({ useEnvironmentScope: () => true }));

const environmentId = EnvironmentId.make("local");
const project = {
  id: ProjectId.make("project"),
  environmentId,
  title: "Project",
  workspaceRoot: "/project",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const older = makeThreadFixture({
  id: ThreadId.make("older"),
  environmentId,
  projectId: project.id,
  title: "Older",
  createdAt: "2026-01-01T00:00:00.000Z",
});
const newer = makeThreadFixture({
  id: ThreadId.make("newer"),
  environmentId,
  projectId: project.id,
  title: "Newer",
  createdAt: "2026-01-02T00:00:00.000Z",
});

function workspace(): ProjectWorkspace {
  return {
    savedSplit: null,
    suspendSplit: vi.fn(),
    restoreSplit: vi.fn(() => null),
    split: null,
    splitTab: vi.fn(),
    focusSplit: vi.fn(),
    closeSplit: vi.fn(),
    resizeSplit: vi.fn(),
    owner: null,
    projectRef: null,
    activeSurface: null,
    surfaces: [],
    shortcuts: {},
    browserAvailable: true,
    terminalAvailable: true,
    openingBrowser: false,
    addBrowser: vi.fn(async () => {}),
    addTerminal: vi.fn(),
    splitTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    closeSurface: vi.fn(),
    selectSurface: vi.fn(),
    showThread: vi.fn(),
    activateTerminal: vi.fn(),
    surfaceTitle: () => "Terminal",
  };
}

it("shows only this project's threads newest first and switches by mouse and keyboard", async () => {
  data.threads = [
    older,
    makeThreadFixture({ projectId: ProjectId.make("other"), title: "Other project" }),
    newer,
  ];
  const state = workspace();
  const open = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={open}
      onNewThread={() => {}}
    />,
  );
  expect(
    [...screen.container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent),
  ).toEqual(["Newer", "Older"]);
  await screen.getByRole("tab", { name: "Newer" }).click();
  expect(open).toHaveBeenCalledWith(newer.id);
  expect(state.showThread).toHaveBeenCalled();
  await userEvent.keyboard("{End}");
  await expect.element(screen.getByRole("tab", { name: "Older" })).toHaveFocus();
});

it("opens thread, web and terminal from the leading plus menu", async () => {
  data.threads = [older];
  const state = workspace();
  const newThread = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={() => {}}
      onNewThread={newThread}
    />,
  );
  for (const [label, callback] of [
    ["Browser", state.addBrowser],
    ["Terminal", state.addTerminal],
    ["New thread", newThread],
  ] as const) {
    await screen.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    expect(callback).toHaveBeenCalledOnce();
  }
});

it("selects and closes resource tabs while retaining project threads", async () => {
  data.threads = [older];
  const state = workspace();
  const terminal = {
    id: "terminal:test",
    kind: "terminal",
    resourceId: "test",
    terminalIds: ["test"],
    activeTerminalId: "test",
  } as const;
  state.surfaces = [{ ...terminal, terminalIds: ["test"] }];
  state.activeSurface = state.surfaces[0]!;
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={() => {}}
      onNewThread={() => {}}
    />,
  );
  await expect
    .element(screen.getByRole("tab", { name: "Terminal" }))
    .toHaveAttribute("aria-selected", "true");
  await screen.getByRole("tab", { name: "Terminal" }).click();
  expect(state.selectSurface).toHaveBeenCalledWith(state.activeSurface);
  await screen.getByRole("button", { name: "Close tab" }).click();
  expect(state.closeSurface).toHaveBeenCalledWith(state.activeSurface);
  await screen.getByRole("tab", { name: "Older" }).click();
  expect(state.showThread).toHaveBeenCalledOnce();
});

it("splits a thread from its context menu and keeps another thread in the primary pane", async () => {
  data.threads = [older, newer];
  showContextMenu.mockResolvedValueOnce("half");
  const state = workspace();
  const open = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={open}
      onNewThread={() => {}}
    />,
  );
  await screen.getByRole("tab", { name: "Older" }).click({ button: "right" });
  expect(showContextMenu).toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(state.splitTab).toHaveBeenCalledWith(
      { kind: "thread", threadId: older.id },
      "right",
      50,
    ),
  );
  expect(open).toHaveBeenCalledWith(newer.id);
});

it("opens the tab context menu from the status dot without switching threads", async () => {
  data.threads = [older, newer];
  showContextMenu.mockResolvedValueOnce("close-split");
  const state = workspace();
  const open = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={open}
      onNewThread={() => {}}
    />,
  );
  const dot = screen
    .getByRole("tab", { name: "Newer" })
    .element()
    .querySelector("[data-tab-menu-trigger]")!;
  await userEvent.click(dot);
  await vi.waitFor(() => expect(state.closeSplit).toHaveBeenCalledOnce());
  expect(open).not.toHaveBeenCalled();
  expect(state.showThread).not.toHaveBeenCalled();
});

it("selects split and primary thread tabs without closing or resizing the split", async () => {
  data.threads = [older, newer];
  const state = workspace();
  state.split = { target: { kind: "thread", threadId: newer.id }, direction: "right", ratio: 75 };
  const open = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={open}
      onNewThread={() => {}}
    />,
  );
  await screen.getByRole("tab", { name: "Newer" }).click();
  expect(state.focusSplit).toHaveBeenCalledWith(true);
  expect(open).not.toHaveBeenCalled();
  await screen.getByRole("tab", { name: "Older" }).click();
  expect(state.focusSplit).toHaveBeenCalledWith(false);
  expect(state.closeSplit).not.toHaveBeenCalled();
  expect(state.splitTab).not.toHaveBeenCalled();
  expect(state.split.ratio).toBe(75);
});

it("offers reference size presets and applies one quarter to the selected panel", async () => {
  data.threads = [older, newer];
  const state = workspace();
  showContextMenu.mockResolvedValueOnce("quarter");
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={() => {}}
      onNewThread={() => {}}
    />,
  );
  await screen.getByRole("tab", { name: "Newer" }).click({ button: "right" });
  await vi.waitFor(() =>
    expect(state.splitTab).toHaveBeenCalledWith(
      { kind: "thread", threadId: newer.id },
      "right",
      75,
    ),
  );
  const items = showContextMenu.mock.lastCall?.[0];
  expect(items[0].children.map((item: { label: string }) => item.label)).toEqual([
    "Maximize",
    "1/2",
    "1/3",
    "1/4",
    "Auto Fit",
    "Hide panel",
  ]);
});

it.each(["right", "down", "close-split"] as const)(
  "runs %s from the tab context menu",
  async (action) => {
    data.threads = [older, newer];
    const state = workspace();
    state.split = { target: { kind: "thread", threadId: newer.id }, direction: "right", ratio: 75 };
    showContextMenu.mockResolvedValueOnce(action);
    await using screen = await render(
      <ProjectWorkspaceTabs
        project={project}
        threadId={older.id}
        threadTitle={older.title}
        workspace={state}
        onOpenThread={() => {}}
        onNewThread={() => {}}
      />,
    );
    await screen.getByRole("tab", { name: "Newer" }).click({ button: "right" });
    if (action === "close-split") {
      await vi.waitFor(() => expect(state.closeSplit).toHaveBeenCalledOnce());
    } else {
      await vi.waitFor(() =>
        expect(state.splitTab).toHaveBeenCalledWith(
          { kind: "thread", threadId: newer.id },
          action,
          75,
        ),
      );
    }
    const items = showContextMenu.mock.lastCall?.[0];
    expect(items.map((item: { label: string }) => item.label)).toEqual([
      "Split",
      "Split right",
      "Split down",
      "Close split",
    ]);
  },
);

it("opens a thread outside the visible split in the full main frame", async () => {
  const outside = makeThreadFixture({
    id: ThreadId.make("outside"),
    environmentId,
    projectId: project.id,
    title: "Outside",
  });
  data.threads = [older, newer, outside];
  const state = workspace();
  state.split = { target: { kind: "thread", threadId: newer.id }, direction: "right", ratio: 75 };
  const open = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={open}
      onNewThread={() => {}}
    />,
  );
  await screen.getByRole("tab", { name: "Outside" }).click();
  expect(state.suspendSplit).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledWith(outside.id);
});

it("leaves the split before creating a new thread tab", async () => {
  data.threads = [older, newer];
  const state = workspace();
  state.split = { target: { kind: "thread", threadId: newer.id }, direction: "right", ratio: 50 };
  const create = vi.fn();
  await using screen = await render(
    <ProjectWorkspaceTabs
      project={project}
      threadId={older.id}
      threadTitle={older.title}
      workspace={state}
      onOpenThread={() => {}}
      onNewThread={create}
    />,
  );
  await screen.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("menuitem", { name: "New thread", exact: true }).click();
  expect(state.suspendSplit).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  expect(vi.mocked(state.suspendSplit).mock.invocationCallOrder[0]).toBeLessThan(
    create.mock.invocationCallOrder[0]!,
  );
});

it.each([true, false])(
  "restores the original split when returning to a member tab (secondary=%s)",
  async (secondary) => {
    const outside = makeThreadFixture({
      id: ThreadId.make("new-tab"),
      environmentId,
      projectId: project.id,
      title: "New tab",
    });
    data.threads = [older, newer, outside];
    const state = workspace();
    state.savedSplit = {
      target: { kind: "thread", threadId: newer.id },
      primary: { kind: "thread", threadId: older.id },
      direction: "right",
      ratio: 75,
      hidden: true,
    };
    vi.mocked(state.restoreSplit).mockReturnValue(older.id);
    const open = vi.fn();
    await using screen = await render(
      <ProjectWorkspaceTabs
        project={project}
        threadId={outside.id}
        threadTitle={outside.title}
        workspace={state}
        onOpenThread={open}
        onNewThread={() => {}}
      />,
    );
    await screen.getByRole("tab", { name: secondary ? "Newer" : "Older" }).click();
    expect(state.restoreSplit).toHaveBeenCalledWith(secondary);
    expect(open).toHaveBeenCalledWith(older.id);
    expect(state.closeSplit).not.toHaveBeenCalled();
    expect(state.splitTab).not.toHaveBeenCalled();
  },
);
