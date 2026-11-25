import { Suspense, lazy } from "react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { PersistentThreadTerminalPanel } from "../PersistentThreadTerminals";
import type { TerminalContextSelection } from "../../lib/terminalContext";
import type { ProjectWorkspace } from "./useProjectWorkspace";
const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);

export function ProjectWorkspaceSurfaces(props: {
  workspace: ProjectWorkspace;
  pane?: "primary" | "secondary";
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
}) {
  const { workspace } = props;
  const { owner, projectRef } = workspace;
  if (!owner || !projectRef) return null;
  const secondaryId =
    workspace.split?.target.kind === "surface" ? workspace.split.target.surfaceId : null;
  return workspace.surfaces
    .filter((surface) => (surface.id === secondaryId) === (props.pane === "secondary"))
    .map((surface) => {
      const visible = props.pane === "secondary" || workspace.activeSurface?.id === surface.id;
      return (
        <div
          key={`${owner.environmentId}:${owner.threadId}:${surface.id}`}
          className={visible ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
          data-project-workspace-surface={surface.id}
        >
          {surface.kind === "preview" ? (
            <Suspense fallback={null}>
              <PreviewPanel
                mode="embedded"
                threadRef={owner}
                tabId={surface.resourceId}
                visible={visible}
              />
            </Suspense>
          ) : (
            <PersistentThreadTerminalPanel
              visible={visible}
              projectRef={projectRef}
              threadRef={owner}
              surface={surface}
              launchContext={null}
              keybindings={props.keybindings}
              onAddTerminalContext={props.onAddTerminalContext}
              onSplitTerminal={() => workspace.splitTerminal(surface, "horizontal")}
              onSplitTerminalVertical={() => workspace.splitTerminal(surface, "vertical")}
              onNewTerminal={workspace.addTerminal}
              onActiveTerminalChange={(id) => workspace.activateTerminal(surface.id, id)}
              onCloseTerminal={(id) => workspace.closeTerminal(surface, id)}
            />
          )}
        </div>
      );
    });
}
