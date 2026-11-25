import type { AuthProjectVisibility, EnvironmentId, ProjectId } from "@t3tools/contracts";

/**
 * What the sidebar knows about one environment. `pending` hides its projects until the server
 * answers, so a hidden project never flashes in.
 */
export type SidebarProjectVisibility = AuthProjectVisibility | "pending";

/** Environments that list every project are left out. */
export type VisibilityByEnvironment = ReadonlyMap<EnvironmentId, SidebarProjectVisibility>;

export const EVERY_PROJECT: AuthProjectVisibility = { mode: "all" };
export const EVERY_ENVIRONMENT: VisibilityByEnvironment = new Map();

export function resolveSidebarProjectVisibility(input: {
  /** The server's latest answer on this connection. */
  readonly live: AuthProjectVisibility | null;
  /** The last answer this browser saw, for reloads and offline environments. */
  readonly remembered: AuthProjectVisibility | null;
  /** Undefined until the server config loads; false on servers without the feature. */
  readonly supported: boolean | undefined;
  readonly connected: boolean;
  readonly failed: boolean;
}): SidebarProjectVisibility {
  if (input.supported === false) return EVERY_PROJECT;
  if (input.live !== null) return input.live;
  if (input.remembered !== null) return input.remembered;
  return input.connected && !input.failed ? "pending" : EVERY_PROJECT;
}

export type IsProjectListed = (environmentId: EnvironmentId, projectId: ProjectId) => boolean;

export function projectListFilter(visibility: VisibilityByEnvironment): IsProjectListed {
  const listed = new Map(
    [...visibility].map(
      ([environmentId, value]) =>
        [
          environmentId,
          new Set<ProjectId>(
            value !== "pending" && value.mode === "selected" ? value.projectIds : [],
          ),
        ] as const,
    ),
  );
  return (environmentId, projectId) => listed.get(environmentId)?.has(projectId) ?? true;
}

/** Keeps the array itself when nothing is hidden, so memoized consumers do not recompute. */
export function filterListed<A>(
  items: ReadonlyArray<A>,
  visibility: VisibilityByEnvironment,
  isListed: (item: A) => boolean,
): ReadonlyArray<A> {
  return visibility.size === 0 ? items : items.filter(isListed);
}

const sameVisibility = (left: SidebarProjectVisibility, right: SidebarProjectVisibility) =>
  left === "pending" || right === "pending"
    ? left === right
    : left.mode === "selected" && right.mode === "selected"
      ? left.projectIds.length === right.projectIds.length &&
        left.projectIds.every((projectId, index) => projectId === right.projectIds[index])
      : left.mode === right.mode;

export function sameVisibilityByEnvironment(
  left: VisibilityByEnvironment,
  right: VisibilityByEnvironment,
): boolean {
  return (
    left.size === right.size &&
    [...left].every(([environmentId, value]) => {
      const other = right.get(environmentId);
      return other !== undefined && sameVisibility(value, other);
    })
  );
}
