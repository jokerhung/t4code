import { AuthProjectVisibility } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

type Selected = Extract<AuthProjectVisibility, { readonly mode: "selected" }>;

const StoredVisibility = Schema.fromJsonString(AuthProjectVisibility);
const decodeStored = Schema.decodeUnknownOption(StoredVisibility);
const encodeStored = Schema.encodeSync(StoredVisibility);

/** The limit to keep, or null for every project. `all` is never stored, and ids are unique. */
export function limitedProjectVisibility(
  visibility: AuthProjectVisibility | null | undefined,
): Selected | null {
  return visibility?.mode === "selected"
    ? { mode: "selected", projectIds: [...new Set(visibility.projectIds)] }
    : null;
}

export function encodeProjectVisibility(
  visibility: AuthProjectVisibility | null | undefined,
): string | null {
  const limited = limitedProjectVisibility(visibility);
  return limited === null ? null : encodeStored(limited);
}

/**
 * An unreadable value shows every project: this only declutters a sidebar, so hiding nothing is
 * the safe reading, and it must never make a session or pairing link fail to load.
 */
export const readProjectVisibility = Effect.fn("persistence.readProjectVisibility")(function* (
  stored: unknown,
) {
  if (stored === null || stored === undefined) return null;
  const decoded = decodeStored(stored);
  if (Option.isNone(decoded)) {
    yield* Effect.logWarning("Ignored an unreadable project visibility value.");
    return null;
  }
  return limitedProjectVisibility(decoded.value);
});
