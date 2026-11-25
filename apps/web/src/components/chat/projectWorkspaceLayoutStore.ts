import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "../../lib/storage";
import type { ThreadId } from "@t3tools/contracts";

export type WorkspacePaneTarget =
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "surface"; surfaceId: string };
export type WorkspaceSplitDirection = "right" | "down";
export interface WorkspaceSplit {
  target: WorkspacePaneTarget;
  direction: WorkspaceSplitDirection;
  ratio: number;
  focused?: boolean;
  hidden?: boolean;
  primary?: WorkspacePaneTarget;
}

export const useProjectWorkspaceLayout = create<{
  byProject: Record<string, WorkspaceSplit | undefined>;
  split: (
    key: string,
    target: WorkspacePaneTarget,
    direction: WorkspaceSplitDirection,
    ratio?: number,
  ) => void;
  hide: (key: string, primary: WorkspacePaneTarget) => void;
  restore: (key: string, focused: boolean) => void;
  focus: (key: string, focused: boolean) => void;
  resize: (key: string, ratio: number) => void;
  close: (key: string) => void;
}>()(
  persist(
    (set) => ({
      byProject: {},
      split: (key, target, direction, ratio = 50) =>
        set((state) => ({
          byProject: { ...state.byProject, [key]: { target, direction, ratio, focused: true } },
        })),
      hide: (key, primary) =>
        set((state) => {
          const split = state.byProject[key];
          return split && !split.hidden
            ? { byProject: { ...state.byProject, [key]: { ...split, primary, hidden: true } } }
            : state;
        }),
      restore: (key, focused) =>
        set((state) => {
          const split = state.byProject[key];
          return split
            ? { byProject: { ...state.byProject, [key]: { ...split, hidden: false, focused } } }
            : state;
        }),
      focus: (key, focused) =>
        set((state) => {
          const split = state.byProject[key];
          return split && split.focused !== focused
            ? { byProject: { ...state.byProject, [key]: { ...split, focused } } }
            : state;
        }),
      resize: (key, ratio) =>
        set((state) => {
          const split = state.byProject[key];
          return split
            ? {
                byProject: {
                  ...state.byProject,
                  [key]: { ...split, ratio: Math.max(25, Math.min(75, ratio)) },
                },
              }
            : state;
        }),
      close: (key) => set((state) => ({ byProject: { ...state.byProject, [key]: undefined } })),
    }),
    {
      name: "t3code:project-workspace-layout:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ byProject }) => ({ byProject }),
    },
  ),
);
