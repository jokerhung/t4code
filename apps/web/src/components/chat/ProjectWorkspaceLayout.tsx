import { lazy, Suspense, useRef, type ReactNode } from "react";
import { useGT } from "gt-react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ComposerHandleContext } from "../../composerHandleContext";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import type { TerminalContextSelection } from "../../lib/terminalContext";
import { useQuietThreadShell } from "../../state/entities";
import { useOpenThreadFamily } from "../ThreadRouteView";
import { BackgroundThreadContext } from "./backgroundThread";
import { ProjectWorkspaceSurfaces } from "./ProjectWorkspaceSurfaces";
import type { ProjectWorkspace } from "./useProjectWorkspace";

const ChatView = lazy(() => import("../ChatView"));

export function ProjectWorkspaceLayout(props: {
  workspace: ProjectWorkspace;
  children: ReactNode;
  keybindings: ResolvedKeybindingsConfig;
  parentPanel: SideChatParentPanel;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
}) {
  const gt = useGT();
  const container = useRef<HTMLDivElement>(null);
  const { workspace } = props;
  const split = workspace.split;
  const horizontal = split?.direction === "right";
  const target = split?.target;
  const secondaryRef =
    target?.kind === "thread" && workspace.projectRef
      ? scopeThreadRef(workspace.projectRef.environmentId, target.threadId)
      : null;
  const thread = useQuietThreadShell(secondaryRef);
  useOpenThreadFamily(secondaryRef, secondaryRef !== null && thread === null);
  const surface =
    target?.kind === "surface"
      ? workspace.surfaces.find((surface) => surface.id === target.surfaceId)
      : null;
  const title = thread?.title ?? (surface ? workspace.surfaceTitle(surface) : gt("Thread"));
  return (
    <div
      ref={container}
      className={`flex min-h-0 min-w-0 flex-1 ${horizontal ? "flex-row" : "flex-col"}`}
      data-project-workspace-layout={split?.direction ?? "single"}
    >
      <div
        className="relative flex min-h-0 min-w-0 flex-col"
        style={{ flex: split ? `${split.ratio} 1 0%` : "1 1 0%" }}
        onFocusCapture={() => workspace.focusSplit(false)}
        onPointerDownCapture={() => workspace.focusSplit(false)}
        data-workspace-pane="primary"
      >
        {props.children}
      </div>
      {split ? (
        <>
          <div
            role="separator"
            tabIndex={0}
            aria-label={gt("Resize split")}
            aria-orientation={horizontal ? "vertical" : "horizontal"}
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(split.ratio)}
            className={
              horizontal
                ? "relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border before:absolute before:inset-x-0 before:bottom-full before:h-[calc((var(--workspace-topbar-height)-2rem)/2)] before:bg-inherit after:absolute after:inset-y-0 after:-inset-x-1 hover:bg-primary/50 focus-visible:bg-primary"
                : "relative z-10 h-px shrink-0 cursor-row-resize touch-none bg-border after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-primary/50 focus-visible:bg-primary"
            }
            onDoubleClick={() => workspace.resizeSplit(50)}
            onPointerDown={(event) => {
              if (event.button === 0) {
                event.currentTarget.focus();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const bounds = container.current?.getBoundingClientRect();
              if (!bounds) return;
              workspace.resizeSplit(
                horizontal
                  ? ((event.clientX - bounds.left) / bounds.width) * 100
                  : ((event.clientY - bounds.top) / bounds.height) * 100,
              );
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const previous = horizontal ? "ArrowLeft" : "ArrowUp";
              const next = horizontal ? "ArrowRight" : "ArrowDown";
              if (event.key === previous || event.key === next || event.key === "Home") {
                event.preventDefault();
                workspace.resizeSplit(
                  event.key === "Home" ? 50 : split.ratio + (event.key === previous ? -5 : 5),
                );
              }
            }}
          />
          <section
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flex: `${100 - split.ratio} 1 0%` }}
            aria-label={title}
            onFocusCapture={() => workspace.focusSplit(true)}
            onPointerDownCapture={() => workspace.focusSplit(true)}
            data-workspace-pane="secondary"
          >
            {secondaryRef ? (
              <div
                className="flex min-h-0 flex-1 flex-col"
                data-side-chat-pane={secondaryRef.threadId}
              >
                <BackgroundThreadContext value>
                  <ComposerHandleContext value={null}>
                    <Suspense fallback={null}>
                      <ChatView
                        key={`${secondaryRef.environmentId}:${secondaryRef.threadId}`}
                        environmentId={secondaryRef.environmentId}
                        threadId={secondaryRef.threadId}
                        routeKind="server"
                        embedded={props.parentPanel}
                      />
                    </Suspense>
                  </ComposerHandleContext>
                </BackgroundThreadContext>
              </div>
            ) : (
              <ProjectWorkspaceSurfaces
                workspace={workspace}
                pane="secondary"
                keybindings={props.keybindings}
                onAddTerminalContext={props.onAddTerminalContext}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
