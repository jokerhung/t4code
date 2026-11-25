import { ThreadId } from "@t3tools/contracts";
import { beforeEach, expect, it } from "vite-plus/test";
import { useProjectWorkspaceLayout } from "./projectWorkspaceLayoutStore";

beforeEach(() => useProjectWorkspaceLayout.setState({ byProject: {} }));

it("keeps split layouts isolated by project and constrains both panes while resizing", () => {
  const store = useProjectWorkspaceLayout.getState();
  store.split("one", { kind: "surface", surfaceId: "browser:one" }, "right");
  store.split("two", { kind: "surface", surfaceId: "terminal:two" }, "down");
  store.resize("one", 100);
  expect(useProjectWorkspaceLayout.getState().byProject.one?.ratio).toBe(75);
  expect(useProjectWorkspaceLayout.getState().byProject.two?.direction).toBe("down");
  expect(useProjectWorkspaceLayout.getState().byProject.two?.ratio).toBe(50);
  store.resize("one", 0);
  expect(useProjectWorkspaceLayout.getState().byProject.one?.ratio).toBe(25);
  store.close("one");
  expect(useProjectWorkspaceLayout.getState().byProject.one).toBeUndefined();
  expect(useProjectWorkspaceLayout.getState().byProject.two).toBeDefined();
  store.close("two");
});

it("restores project split directions, sizes and selected panes after reload", async () => {
  const store = useProjectWorkspaceLayout.getState();
  store.split("one", { kind: "surface", surfaceId: "browser:one" }, "right");
  store.resize("one", 67);
  store.focus("one", false);
  store.split("two", { kind: "surface", surfaceId: "terminal:two" }, "down", 75);
  const expected = useProjectWorkspaceLayout.getState().byProject;
  await reloadLayout();
  expect(useProjectWorkspaceLayout.getState().byProject).toEqual(expected);
  useProjectWorkspaceLayout.getState().close("one");
  await reloadLayout();
  expect(useProjectWorkspaceLayout.getState().byProject.one).toBeUndefined();
  expect(useProjectWorkspaceLayout.getState().byProject.two).toEqual(expected.two);
});

async function reloadLayout() {
  const { storage, name } = useProjectWorkspaceLayout.persist.getOptions();
  const saved = await storage!.getItem(name!);
  expect(saved).not.toBeNull();
  useProjectWorkspaceLayout.setState(useProjectWorkspaceLayout.getInitialState());
  await storage!.setItem(name!, saved!);
  await useProjectWorkspaceLayout.persist.rehydrate();
  expect(useProjectWorkspaceLayout.persist.hasHydrated()).toBe(true);
}

it("retains a hidden split while opening other tabs and restores it after reload", async () => {
  const store = useProjectWorkspaceLayout.getState();
  const primary = { kind: "thread", threadId: ThreadId.make("first") } as const;
  const secondary = { kind: "thread", threadId: ThreadId.make("second") } as const;
  store.split("project", secondary, "right", 67);
  store.hide("project", primary);
  store.hide("project", { kind: "thread", threadId: ThreadId.make("new-tab") });
  await reloadLayout();
  expect(useProjectWorkspaceLayout.getState().byProject.project).toMatchObject({
    primary,
    target: secondary,
    ratio: 67,
    hidden: true,
  });
  useProjectWorkspaceLayout.getState().restore("project", true);
  expect(useProjectWorkspaceLayout.getState().byProject.project).toMatchObject({
    primary,
    target: secondary,
    ratio: 67,
    direction: "right",
    hidden: false,
    focused: true,
  });
});
