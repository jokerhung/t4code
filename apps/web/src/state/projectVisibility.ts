import { useAtomValue } from "@effect/atom-react";
import { AuthProjectVisibility, type EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";

import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import {
  resolveSidebarProjectVisibility,
  sameVisibilityByEnvironment,
  type SidebarProjectVisibility,
  type VisibilityByEnvironment,
} from "../projectVisibility.logic";
import { authEnvironment } from "./auth";
import { environmentPresentations } from "./presentation";

const STORAGE_KEY = "t3code:project-visibility:v1";
const RememberedVisibility = Schema.Record(Schema.String, AuthProjectVisibility);

function readRemembered(): typeof RememberedVisibility.Type {
  try {
    return getLocalStorageItem(STORAGE_KEY, RememberedVisibility) ?? {};
  } catch {
    return {};
  }
}

function remember(environmentId: EnvironmentId, visibility: AuthProjectVisibility): void {
  try {
    setLocalStorageItem(
      STORAGE_KEY,
      { ...readRemembered(), [environmentId]: visibility },
      RememberedVisibility,
    );
  } catch {
    // Without storage a reload waits for the server again.
  }
}

const environmentProjectVisibilityAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get): SidebarProjectVisibility => {
    const presentation = get(environmentPresentations.presentationsAtom).get(environmentId);
    const capabilities = presentation?.serverConfig?.environment.capabilities;
    const supported =
      capabilities === undefined ? undefined : capabilities.projectVisibility === true;
    // Older servers lack the stream, so it is opened only once the server says it has one.
    const result =
      supported === true
        ? get(authEnvironment.projectVisibility({ environmentId, input: {} }))
        : null;
    const live = result === null ? null : Option.getOrNull(AsyncResult.value(result));
    if (live !== null) remember(environmentId, live);
    return resolveSidebarProjectVisibility({
      live,
      remembered: readRemembered()[environmentId] ?? null,
      supported,
      connected: presentation?.connection.phase === "connected",
      failed: result !== null && AsyncResult.isFailure(result),
    });
  }).pipe(Atom.withLabel(`web-project-visibility:${environmentId}`)),
);

const sidebarProjectVisibilityAtom = Atom.make((get): VisibilityByEnvironment => {
  const next = new Map<EnvironmentId, SidebarProjectVisibility>();
  for (const environmentId of get(environmentPresentations.presentationsAtom).keys()) {
    const visibility = get(environmentProjectVisibilityAtom(environmentId));
    if (visibility === "pending" || visibility.mode === "selected") {
      next.set(environmentId, visibility);
    }
  }
  const previous = Option.getOrUndefined(get.self<VisibilityByEnvironment>());
  return previous !== undefined && sameVisibilityByEnvironment(previous, next) ? previous : next;
}).pipe(Atom.withLabel("web-sidebar-project-visibility"));

/** Which projects this device's sidebar lists, for the environments that limit them. */
export function useSidebarProjectVisibility(): VisibilityByEnvironment {
  return useAtomValue(sidebarProjectVisibilityAtom);
}
