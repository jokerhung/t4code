import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, type ScopedProjectRef } from "@t3tools/contracts";

export function projectTerminalRef(project: ScopedProjectRef) {
  return scopeThreadRef(
    project.environmentId,
    ThreadId.make(`project-terminal:${project.projectId}`),
  );
}
