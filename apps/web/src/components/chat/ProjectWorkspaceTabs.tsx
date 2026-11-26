import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AuthOrchestrationOperateScope,
  type ContextMenuItem,
  type ScopedProjectRef,
  type ThreadId,
} from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import { T, useGT } from "gt-react";
import { Globe2Icon, MessageSquareIcon, PlusIcon, TerminalIcon, XIcon } from "lucide-react";
import { useQuietThreadShells } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { useThreadActionMenu } from "../../hooks/useThreadActionMenu";
import { resolveRenameCommit } from "../threadActionMenu.logic";
import { toastManager } from "../ui/toast";
import { canShareWithGuestAtom } from "./guestShareAvailability";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { PanelTabCloseButton } from "../ui/panel-tab-close-button";
import { resolveSidebarRowStatus } from "../Sidebar.logic";
import { readLocalApi } from "../../localApi";
import { contextMenuSourceOf } from "../../contextMenuSource";
import type { WorkspacePaneTarget } from "./projectWorkspaceLayoutStore";
import type { ProjectWorkspace } from "./useProjectWorkspace";

export function projectWorkspaceThreads(
  threads: readonly EnvironmentThreadShell[],
  project: ScopedProjectRef,
) {
  return threads
    .filter(
      (thread) =>
        thread.environmentId === project.environmentId &&
        thread.projectId === project.projectId &&
        thread.archivedAt === null,
    )
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function ProjectWorkspaceTabs(props: {
  project: EnvironmentProject;
  threadId: ThreadId;
  threadTitle: string;
  workspace: ProjectWorkspace;
  onOpenThread: (threadId: ThreadId) => void;
  onNewThread: () => void;
}) {
  const gt = useGT();
  const threads = useQuietThreadShells();
  const projectThreads = projectWorkspaceThreads(threads, {
    environmentId: props.project.environmentId,
    projectId: props.project.id,
  });
  const tabs = projectThreads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    status: resolveSidebarRowStatus(thread),
  }));
  if (!tabs.some((thread) => thread.id === props.threadId))
    tabs.unshift({ id: props.threadId, title: props.threadTitle, status: "ready" });
  const canCreateThread = useEnvironmentScope(
    props.project.environmentId,
    AuthOrchestrationOperateScope,
  );
  const list = useRef<HTMLDivElement>(null);
  const focusedTarget = props.workspace.split?.focused ? props.workspace.split.target : null;
  const selectedId = focusedTarget
    ? focusedTarget.kind === "thread"
      ? focusedTarget.threadId
      : focusedTarget.surfaceId
    : (props.workspace.activeSurface?.id ?? props.threadId);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the selected project tab visible when navigation selects a thread beyond the horizontal viewport
  useEffect(() => {
    list.current
      ?.querySelector(`[data-workspace-tab="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);
  const openThread = (id: ThreadId) => {
    const group = props.workspace.savedSplit ?? props.workspace.split;
    const secondary = group?.target.kind === "thread" && group.target.threadId === id;
    const primary = group?.primary?.kind === "thread" && group.primary.threadId === id;
    if (secondary || primary) {
      if (group?.hidden) {
        const primaryId = props.workspace.restoreSplit(secondary);
        if (primaryId && primaryId !== props.threadId) props.onOpenThread(primaryId);
      } else props.workspace.focusSplit(secondary);
      return;
    }
    if (props.workspace.split && (props.workspace.activeSurface || id !== props.threadId))
      props.workspace.suspendSplit();
    props.workspace.focusSplit(false);
    props.workspace.showThread();
    if (id !== props.threadId) props.onOpenThread(id);
  };
  const canShareWithGuest = useAtomValue(canShareWithGuestAtom(props.project.environmentId));
  const [renaming, setRenaming] = useState<{ threadId: ThreadId; title: string } | null>(null);
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const threadMenu = useThreadActionMenu({
    threadRef: null,
    projectCwd: props.project.workspaceRoot,
    onStartRename: ({ threadId }) => {
      const thread = tabs.find((tab) => tab.id === threadId);
      if (thread) setRenaming({ threadId, title: thread.title });
    },
    canShareWithGuest,
  });
  const commitRename = async (threadId: ThreadId, originalTitle: string, title: string) => {
    setRenaming(null);
    const resolution = resolveRenameCommit({ title, originalTitle });
    if (resolution.action === "reject-empty") {
      toastManager.add({ type: "warning", title: gt("Thread title cannot be empty") });
      return;
    }
    if (resolution.action === "noop") return;
    const result = await updateThreadMetadata({
      environmentId: props.project.environmentId,
      input: { threadId, title: resolution.title },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Failed to rename thread"),
        description: error instanceof Error ? error.message : gt("An error occurred."),
      });
    }
  };
  const contextMenu = (event: MouseEvent, target: WorkspacePaneTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const position = { x: event.clientX, y: event.clientY };
    const source = contextMenuSourceOf(event);
    const items: ReadonlyArray<ContextMenuItem<string>> = [
      {
        id: "split",
        label: gt("Split"),
        disabled:
          target.kind === "thread" &&
          !projectThreads.some((thread) => thread.id === target.threadId),
        children: [
          { id: "maximize", label: gt("Maximize"), detail: "100%" },
          { id: "half", label: "1/2", detail: "50%" },
          { id: "third", label: "1/3", detail: "33%" },
          { id: "quarter", label: "1/4", detail: "25%" },
          { id: "auto", label: gt("Auto Fit"), detail: gt("Auto") },
          { id: "hide", label: gt("Hide panel"), separatorBefore: true },
        ],
      },
      { id: "right", label: gt("Split right"), separatorBefore: true },
      { id: "down", label: gt("Split down") },
      { id: "close-split", label: gt("Close split"), disabled: !props.workspace.split },
    ];
    const apply = (action: string | null | undefined) => {
      if (action === "maximize") {
        props.workspace.closeSplit();
        if (target.kind === "thread") {
          props.workspace.showThread();
          if (target.threadId !== props.threadId) props.onOpenThread(target.threadId);
        } else {
          const surface = props.workspace.surfaces.find(
            (surface) => surface.id === target.surfaceId,
          );
          if (surface) props.workspace.selectSurface(surface);
        }
      } else if (
        action === "half" ||
        action === "third" ||
        action === "quarter" ||
        action === "auto" ||
        action === "right" ||
        action === "down"
      ) {
        if (
          target.kind === "thread" &&
          target.threadId === props.threadId &&
          !props.workspace.activeSurface
        ) {
          const other = tabs.find((tab) => tab.id !== target.threadId);
          if (other) props.onOpenThread(other.id);
        }
        props.workspace.splitTab(
          target,
          action === "down" || action === "right"
            ? action
            : (props.workspace.split?.direction ?? "right"),
          action === "third"
            ? 100 - 100 / 3
            : action === "quarter"
              ? 75
              : action === "down" || action === "right"
                ? (props.workspace.split?.ratio ?? 50)
                : 50,
        );
      } else if (action === "hide" || action === "close-split") props.workspace.closeSplit();
    };
    // Draft and resource tabs have no stored thread, so they only offer the split entries.
    if (
      target.kind === "thread" &&
      projectThreads.some((thread) => thread.id === target.threadId)
    ) {
      threadMenu.openMenu(position, source, {
        threadRef: scopeThreadRef(props.project.environmentId, target.threadId),
        extra: { items, onSelect: apply },
      });
    } else {
      void readLocalApi()?.contextMenu.show(items, position, source).then(apply);
    }
  };
  return (
    // The rule is anchored to the chat header, not this strip, so it crosses the header's padding.
    // The transparent border keeps the tabs' own underline just above it.
    <div
      className="flex h-8 min-w-0 flex-1 items-stretch border-b border-transparent [-webkit-app-region:no-drag] after:pointer-events-none after:absolute after:inset-x-0 after:top-[calc(50%+1rem-1px)] after:h-px after:bg-border"
      data-project-workspace-tabs
    >
      <div className="flex shrink-0 items-center border-r border-border px-1">
        <Menu>
          <MenuTrigger
            render={<Button size="icon-sm" variant="ghost-muted" aria-label={gt("Open")} />}
          >
            <PlusIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="start">
            <MenuItem
              disabled={!canCreateThread}
              onClick={() => {
                props.workspace.suspendSplit();
                props.workspace.showThread();
                props.onNewThread();
              }}
            >
              <MessageSquareIcon />
              <T>New thread</T>
            </MenuItem>
            <MenuSub>
              <MenuSubTrigger>
                <T>Open thread</T>
              </MenuSubTrigger>
              <MenuSubPopup>
                {tabs.map((thread) => (
                  <MenuItem key={thread.id} onClick={() => openThread(thread.id)}>
                    {thread.title}
                  </MenuItem>
                ))}
              </MenuSubPopup>
            </MenuSub>
            <MenuItem
              disabled={!props.workspace.browserAvailable || props.workspace.openingBrowser}
              onClick={() => void props.workspace.addBrowser()}
            >
              <Globe2Icon />
              <T>Browser</T>
            </MenuItem>
            <MenuItem
              disabled={!props.workspace.terminalAvailable}
              onClick={props.workspace.addTerminal}
            >
              <TerminalIcon />
              <T>Terminal</T>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      <div
        ref={list}
        role="tablist"
        aria-label={props.project.title}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const elements = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const current = elements.indexOf(event.target as HTMLButtonElement);
          if (current < 0 || elements.length === 0) return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? elements.length - 1
                : (current + (event.key === "ArrowRight" ? 1 : -1) + elements.length) %
                  elements.length;
          elements[next]?.click();
          elements[next]?.focus();
        }}
      >
        {tabs.map((thread) => {
          const selected = selectedId === thread.id;
          const inSplit =
            props.workspace.split?.target.kind === "thread" &&
            props.workspace.split.target.threadId === thread.id;
          return (
            <WorkspaceTab
              key={thread.id}
              id={thread.id}
              title={thread.title}
              selected={selected}
              inSplit={inSplit}
              rename={
                renaming?.threadId === thread.id && canCreateThread
                  ? {
                      title: renaming.title,
                      label: gt("Thread title"),
                      onCommit: (title) => void commitRename(thread.id, renaming.title, title),
                      onCancel: () => setRenaming(null),
                    }
                  : undefined
              }
              onClick={() => openThread(thread.id)}
              onContextMenu={(event) => contextMenu(event, { kind: "thread", threadId: thread.id })}
            >
              {/* The padding enlarges the dot's click target without moving the title. */}
              <span
                data-tab-menu-trigger
                className="group/dot -mr-2 -ml-3 flex h-full shrink-0 items-center pr-2 pl-3"
              >
                <span
                  className={`size-3 rounded-full ring-ring/40 group-hover/dot:ring-3 ${
                    thread.status === "working" || thread.status === "preparing"
                      ? "bg-success"
                      : thread.status === "waiting" ||
                          thread.status === "approval" ||
                          thread.status === "input"
                        ? "bg-warning"
                        : "bg-muted-foreground/50"
                  }`}
                />
              </span>
            </WorkspaceTab>
          );
        })}
        {props.workspace.surfaces.map((surface) => {
          const selected = selectedId === surface.id;
          const Icon = surface.kind === "preview" ? Globe2Icon : TerminalIcon;
          const title = props.workspace.surfaceTitle(surface);
          const inSplit =
            props.workspace.split?.target.kind === "surface" &&
            props.workspace.split.target.surfaceId === surface.id;
          return (
            <WorkspaceTab
              key={surface.id}
              id={surface.id}
              title={title}
              selected={selected}
              inSplit={inSplit}
              onClick={() => {
                const primaryId = props.workspace.selectSurface(surface);
                if (primaryId && primaryId !== props.threadId) props.onOpenThread(primaryId);
              }}
              onContextMenu={(event) =>
                contextMenu(event, { kind: "surface", surfaceId: surface.id })
              }
              close={
                <PanelTabCloseButton
                  label={gt("Close tab")}
                  onClick={() => props.workspace.closeSurface(surface)}
                >
                  <XIcon className="size-3" />
                </PanelTabCloseButton>
              }
            >
              <Icon className="size-3.5 shrink-0" />
            </WorkspaceTab>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceTab(props: {
  id: string;
  title: string;
  selected: boolean;
  inSplit: boolean;
  onClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  children: ReactNode;
  close?: ReactNode;
  rename?:
    | {
        title: string;
        label: string;
        onCommit: (title: string) => void;
        onCancel: () => void;
      }
    | undefined;
}) {
  // Enter and Escape unmount the input, and a blur that follows must not commit again.
  const renameSettled = useRef(false);
  const { rename } = props;
  if (rename) {
    return (
      <div className="flex h-full w-52 shrink-0 items-center border-r border-border px-2">
        <input
          autoFocus
          dir="auto"
          aria-label={rename.label}
          className="min-w-0 flex-1 rounded-sm bg-transparent text-xs text-foreground outline-none ring-1 ring-inset ring-ring/50 focus:ring-ring"
          defaultValue={rename.title}
          onFocus={(event) => {
            renameSettled.current = false;
            event.currentTarget.select();
          }}
          onBlur={(event) => {
            if (!renameSettled.current) rename.onCommit(event.currentTarget.value);
          }}
          onContextMenu={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key !== "Enter" && event.key !== "Escape") return;
            event.preventDefault();
            renameSettled.current = true;
            if (event.key === "Enter") rename.onCommit(event.currentTarget.value);
            else rename.onCancel();
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={`group/tab relative flex h-full max-w-52 min-w-24 shrink-0 items-center border-r border-border ${props.selected ? "bg-muted/65 text-foreground" : "text-muted-foreground hover:bg-muted/35"}`}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              role="tab"
              data-workspace-tab={props.id}
              aria-selected={props.selected}
              tabIndex={props.selected ? 0 : -1}
              onClick={(event) => {
                const onMenuTrigger =
                  event.target instanceof Element &&
                  event.target.closest("[data-tab-menu-trigger]");
                if (onMenuTrigger) props.onContextMenu(event);
                else props.onClick();
              }}
              onContextMenu={props.onContextMenu}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          {props.children}
          <span className="truncate">{props.title}</span>
        </TooltipTrigger>
        <TooltipPopup>{props.title}</TooltipPopup>
      </Tooltip>
      {props.close ? <span className="mr-2 shrink-0">{props.close}</span> : null}
      {props.selected || props.inSplit ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 ${props.selected ? "bg-foreground/80" : "bg-primary/50"}`}
        />
      ) : null}
    </div>
  );
}
