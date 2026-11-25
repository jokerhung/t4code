import { useEffect, useRef, useState } from "react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  AuthPreviewOperateScope,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { useGT } from "gt-react";
import { projectTerminalRef } from "../../projectTerminal";
import {
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "../../rightPanelStore";
import { useThreadTerminalActions } from "../terminal/useThreadTerminalActions";
import { useAtomCommand } from "../../state/use-atom-command";
import { previewEnvironment } from "../../state/preview";
import { useThreadPreviewState } from "../../previewStateStore";
import { usePreviewAvailable } from "../../browser/previewRuntime";
import { useEnvironmentScope } from "../../state/session";
import { addBrowserSurface } from "../preview/addBrowserSurface";
import { useRightPanelSurfaceClose } from "../../hooks/useRightPanelSurfaceClose";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabelsCopy";
import { useMessages } from "gt-react";
import { toastManager } from "../ui/toast";
import { confirmTerminalClose } from "../../lib/terminalCloseConfirm";
import type { ChatShortcutCommands } from "./useChatShortcuts";

import {
  useProjectWorkspaceLayout,
  type WorkspacePaneTarget,
  type WorkspaceSplitDirection,
} from "./projectWorkspaceLayoutStore";

export type ProjectWorkspaceSurface = Extract<RightPanelSurface, { kind: "preview" | "terminal" }>;

export function useProjectWorkspace(
  projectRef: ScopedProjectRef | null,
  routeThreadRef: ScopedThreadRef,
) {
  const gt = useGT();
  const messages = useMessages();
  const owner = projectRef ? projectTerminalRef(projectRef) : null;
  const projectKey = owner ? scopedThreadKey(owner) : "";
  const splitLayout = useProjectWorkspaceLayout((store) => store.byProject[projectKey] ?? null);
  const closeSplit = () => useProjectWorkspaceLayout.getState().close(projectKey);
  const splitTab = (
    target: WorkspacePaneTarget,
    direction: WorkspaceSplitDirection,
    ratio = 50,
  ) => {
    if (!owner) return;
    useProjectWorkspaceLayout.getState().split(projectKey, target, direction, ratio);
    if (target.kind === "surface") useRightPanelStore.getState().close(owner);
  };
  const state = useRightPanelStore((store) =>
    selectThreadRightPanelState(store.byThreadKey, owner),
  );
  const surfaces = state.surfaces.filter(
    (surface): surface is ProjectWorkspaceSurface =>
      surface.kind === "preview" || surface.kind === "terminal",
  );
  const splitTarget = splitLayout?.target;
  const savedSplit =
    splitTarget?.kind === "surface" &&
    !surfaces.some((surface) => surface.id === splitTarget.surfaceId)
      ? null
      : splitLayout;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- removes a split reference when its browser or terminal surface is closed in the resource store
  useEffect(() => {
    if (splitLayout && !savedSplit) useProjectWorkspaceLayout.getState().close(projectKey);
  }, [splitLayout, savedSplit, projectKey]);
  const split = savedSplit?.hidden ? null : savedSplit;
  const activeSurface = state.isOpen
    ? (surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null)
    : null;
  const suspendSplit = () =>
    useProjectWorkspaceLayout
      .getState()
      .hide(
        projectKey,
        activeSurface
          ? { kind: "surface", surfaceId: activeSurface.id }
          : { kind: "thread", threadId: routeThreadRef.threadId },
      );
  const restoreSplit = (focused: boolean) => {
    const current = useProjectWorkspaceLayout.getState().byProject[projectKey];
    if (!current || !owner) return null;
    useProjectWorkspaceLayout.getState().restore(projectKey, focused);
    if (current.primary?.kind === "surface") {
      useRightPanelStore.getState().activateSurface(owner, current.primary.surfaceId);
      return null;
    }
    useRightPanelStore.getState().close(owner);
    return current.primary?.threadId ?? routeThreadRef.threadId;
  };
  const routeKey = scopedThreadKey(routeThreadRef);
  const lastRoute = useRef(routeKey);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- selecting a thread through routing returns the project's main workspace to its chat view
  useEffect(() => {
    if (lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    if (owner) useRightPanelStore.getState().close(owner);
  }, [owner, routeKey]);
  const terminal = useThreadTerminalActions(owner, projectRef ?? undefined);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const preview = useThreadPreviewState(owner);
  const browserSupported = usePreviewAvailable(projectRef?.environmentId ?? null);
  const canOperatePreview = useEnvironmentScope(
    projectRef?.environmentId ?? null,
    AuthPreviewOperateScope,
  );
  const sessions = useKnownTerminalSessions({
    environmentId: owner?.environmentId ?? null,
    threadId: owner?.threadId ?? null,
  });
  const labels = new Map(
    (sessions ?? []).map((session) => [
      session.target.terminalId,
      resolveTerminalSessionLabel(session.target.terminalId, session.state.summary, messages),
    ]),
  );
  const { closeSurface } = useRightPanelSurfaceClose({
    threadRef: owner,
    terminalLabelsById: labels,
  });
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const addBrowser = async () => {
    if (!owner || !browserSupported || !canOperatePreview || openingBrowser) return;
    setOpeningBrowser(true);
    try {
      const result = await addBrowserSurface({ threadRef: owner, openPreview });
      if (result._tag === "Success") suspendSplit();
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: gt("Unable to open browser"),
          description:
            thrownErrorMessage(squashAtomCommandFailure(result), messages) ??
            gt("An unexpected error occurred."),
        });
      }
    } finally {
      setOpeningBrowser(false);
    }
  };
  const addTerminal = () => {
    if (!owner) return;
    void terminal.launchTerminal({
      place: (terminalId) => {
        suspendSplit();
        useRightPanelStore.getState().openTerminal(owner, terminalId);
      },
    })?.result;
  };
  const splitTerminal = (
    surface: Extract<ProjectWorkspaceSurface, { kind: "terminal" }>,
    direction: "horizontal" | "vertical",
  ) => {
    if (!owner) return;
    void terminal.launchTerminal({
      place: (terminalId) =>
        useRightPanelStore.getState().splitTerminal(owner, surface.id, terminalId, direction),
    })?.result;
  };
  const closeTerminal = (
    surface: Extract<ProjectWorkspaceSurface, { kind: "terminal" }>,
    terminalId: string,
  ) => {
    if (!owner || !terminal.canWrite()) return;
    terminal.closeTerminalSession(terminalId);
    useRightPanelStore.getState().closeTerminal(owner, surface.id, terminalId);
  };
  const terminalSurfaceForEvent = (event: KeyboardEvent) => {
    const secondary =
      event.target instanceof Element && event.target.closest('[data-workspace-pane="secondary"]');
    const surface =
      secondary && splitTarget?.kind === "surface"
        ? surfaces.find((surface) => surface.id === splitTarget.surfaceId)
        : activeSurface;
    return surface?.kind === "terminal" ? surface : null;
  };
  const shortcuts: ChatShortcutCommands = {
    "terminal.new": ({ event }) => {
      if (!terminalSurfaceForEvent(event) || !terminal.canWrite()) return false;
      addTerminal();
    },
    "terminal.split": ({ event }) => {
      const surface = terminalSurfaceForEvent(event);
      if (!surface || !terminal.canWrite()) return false;
      splitTerminal(surface, "horizontal");
    },
    "terminal.splitVertical": ({ event }) => {
      const surface = terminalSurfaceForEvent(event);
      if (!surface || !terminal.canWrite()) return false;
      splitTerminal(surface, "vertical");
    },
    "terminal.close": ({ event }) => {
      const surface = terminalSurfaceForEvent(event);
      if (!surface || !terminal.canWrite()) return false;
      void confirmTerminalClose([
        labels.get(surface.activeTerminalId) ?? surface.activeTerminalId,
      ]).then((confirmed) => {
        if (confirmed) closeTerminal(surface, surface.activeTerminalId);
      });
    },
  };
  return {
    owner,
    split,
    savedSplit,
    suspendSplit,
    restoreSplit,
    splitTab,
    closeSplit,
    focusSplit: (focused: boolean) =>
      useProjectWorkspaceLayout.getState().focus(projectKey, focused),
    resizeSplit: (ratio: number) => useProjectWorkspaceLayout.getState().resize(projectKey, ratio),
    projectRef,
    surfaces,
    activeSurface,
    shortcuts,
    browserAvailable: browserSupported && canOperatePreview,
    terminalAvailable: terminal.canWrite(),
    openingBrowser,
    addBrowser,
    addTerminal,
    splitTerminal,
    closeTerminal,
    closeSurface,
    selectSurface: (surface: ProjectWorkspaceSurface) => {
      const currentSplit = useProjectWorkspaceLayout.getState().byProject[projectKey];
      if (currentSplit?.target.kind === "surface" && currentSplit.target.surfaceId === surface.id)
        return restoreSplit(true);
      if (
        currentSplit?.hidden &&
        currentSplit.primary?.kind === "surface" &&
        currentSplit.primary.surfaceId === surface.id
      )
        return restoreSplit(false);
      if (currentSplit && activeSurface?.id !== surface.id) suspendSplit();
      useProjectWorkspaceLayout.getState().focus(projectKey, false);
      if (owner) useRightPanelStore.getState().activateSurface(owner, surface.id);
      return null;
    },
    showThread: () => {
      if (owner) useRightPanelStore.getState().close(owner);
    },
    activateTerminal: (surfaceId: string, terminalId: string) => {
      if (owner) useRightPanelStore.getState().activateTerminal(owner, surfaceId, terminalId);
    },
    surfaceTitle: (surface: ProjectWorkspaceSurface) => {
      if (surface.kind === "terminal")
        return labels.get(surface.activeTerminalId) ?? gt("Terminal");
      const snapshot = surface.resourceId ? preview.sessions[surface.resourceId] : undefined;
      return snapshot && snapshot.navStatus._tag !== "Idle" && snapshot.navStatus.title.trim()
        ? snapshot.navStatus.title
        : gt("Browser");
    },
  };
}

export type ProjectWorkspace = ReturnType<typeof useProjectWorkspace>;
