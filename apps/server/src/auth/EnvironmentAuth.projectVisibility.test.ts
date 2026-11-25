import * as NodePlatformCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { type AuthProjectVisibility, ProjectId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as ServerSecretStore from "./ServerSecretStore.ts";
import * as SessionStore from "./SessionStore.ts";

const layerEnvironmentAuth = EnvironmentAuth.layer.pipe(
  Layer.provide(ManagedPolicy.layerTest()),
  Layer.provideMerge(SqlitePersistence.layerMemory),
  Layer.provide(ServerSecretStore.layer),
  Layer.provide(ServerEnvironment.layerIdentity),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-project-visibility-test-" })),
);

const requestMetadata = { deviceType: "desktop" as const, os: "Windows", browser: "Chrome" };
const alpha = ProjectId.make("alpha");
const beta = ProjectId.make("beta");
const gamma = ProjectId.make("gamma");
const only = (...projectIds: Array<ProjectId>): AuthProjectVisibility => ({
  mode: "selected",
  projectIds,
});

const pairBrowser = Effect.fnUntraced(function* (credential: string) {
  const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
  const sessions = yield* SessionStore.SessionStore;
  const exchange = yield* serverAuth.createBrowserSession(credential, requestMetadata);
  return (yield* sessions.verify(exchange.sessionToken)).sessionId;
});

const visibilityOf = Effect.fnUntraced(function* (sessionId: string) {
  const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
  const all = yield* serverAuth.listSessions();
  return all.find((session) => session.sessionId === sessionId)?.projectVisibility;
});

it.layer(Layer.mergeAll(NodeServices.layer, NodePlatformCrypto.layer))(
  "EnvironmentAuth project visibility",
  (it) => {
    it.effect("shows every project unless a link limits it", () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        for (const projectVisibility of [undefined, { mode: "all" } as const]) {
          const link = yield* serverAuth.issuePairingCredential(
            projectVisibility ? { projectVisibility } : {},
          );
          const [listed] = (yield* serverAuth.listPairingLinks()).filter(
            (entry) => entry.id === link.id,
          );
          expect(listed?.projectVisibility).toBeUndefined();
          const sessionId = yield* pairBrowser(link.credential);
          expect(yield* visibilityOf(sessionId)).toBeUndefined();
        }
      }).pipe(Effect.provide(layerEnvironmentAuth)),
    );

    it.effect("copies a link's projects to browser and bearer sessions", () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const sessions = yield* SessionStore.SessionStore;
        const browserLink = yield* serverAuth.issuePairingCredential({
          projectVisibility: { mode: "selected", projectIds: [alpha, alpha] },
        });
        expect((yield* serverAuth.listPairingLinks())[0]?.projectVisibility).toEqual(only(alpha));
        expect(yield* visibilityOf(yield* pairBrowser(browserLink.credential))).toEqual(
          only(alpha),
        );

        const bearerLink = yield* serverAuth.issuePairingCredential({
          projectVisibility: { mode: "selected", projectIds: [beta] },
        });
        const token = yield* serverAuth.exchangeBootstrapCredentialForAccessToken(
          bearerLink.credential,
          undefined,
          requestMetadata,
        );
        const bearer = yield* sessions.verify(token.access_token);
        expect(yield* visibilityOf(bearer.sessionId)).toEqual(only(beta));
        // Renewal and peer-link upkeep only move the expiry.
        yield* sessions.extend(
          bearer.sessionId,
          DateTime.toUtc(DateTime.add(bearer.expiresAt!, { days: 1 })),
          Duration.seconds(1),
        );
        expect(yield* visibilityOf(bearer.sessionId)).toEqual(only(beta));
      }).pipe(Effect.provide(layerEnvironmentAuth)),
    );

    it.effect("edits an unused link, then only the device it created", () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const link = yield* serverAuth.issuePairingCredential({});
        const target = { pairingLinkId: link.id };
        expect(
          yield* serverAuth.updateProjectVisibility({ target, projectVisibility: only(gamma) }),
        ).toBe(true);
        const sessionId = yield* pairBrowser(link.credential);
        expect(yield* visibilityOf(sessionId)).toEqual(only(gamma));

        // The link is spent, so the caller is told to edit the device instead.
        expect(
          yield* serverAuth.updateProjectVisibility({ target, projectVisibility: only(alpha) }),
        ).toBe(false);
        expect(yield* visibilityOf(sessionId)).toEqual(only(gamma));

        const edit = (projectVisibility: AuthProjectVisibility) =>
          serverAuth.updateProjectVisibility({ target: { sessionId }, projectVisibility });
        expect(yield* edit(only())).toBe(true);
        expect(yield* visibilityOf(sessionId)).toEqual(only());
        expect(yield* edit({ mode: "all" })).toBe(true);
        expect(yield* visibilityOf(sessionId)).toBeUndefined();

        yield* serverAuth.revokeSession(sessionId);
        expect(yield* edit(only(alpha))).toBe(false);
      }).pipe(Effect.provide(layerEnvironmentAuth)),
    );

    it.effect("adds a project the limited device created, and leaves other devices alone", () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const limited = yield* pairBrowser(
          (yield* serverAuth.issuePairingCredential({
            projectVisibility: { mode: "selected", projectIds: [alpha] },
          })).credential,
        );
        const unlimited = yield* pairBrowser(
          (yield* serverAuth.issuePairingCredential({})).credential,
        );
        yield* Effect.forEach(
          [beta, gamma, beta],
          (projectId) => serverAuth.revealProjectToSession(limited, projectId),
          { concurrency: "unbounded", discard: true },
        );
        yield* serverAuth.revealProjectToSession(unlimited, beta);
        const revealed = yield* visibilityOf(limited);
        expect(revealed?.mode === "selected" ? revealed.projectIds.toSorted() : revealed).toEqual([
          alpha,
          beta,
          gamma,
        ]);
        expect(yield* visibilityOf(unlimited)).toBeUndefined();
      }).pipe(Effect.provide(layerEnvironmentAuth)),
    );

    it.effect("streams a device its own list and later edits only", () =>
      Effect.gen(function* () {
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const watched = yield* pairBrowser(
          (yield* serverAuth.issuePairingCredential({})).credential,
        );
        const other = yield* pairBrowser((yield* serverAuth.issuePairingCredential({})).credential);
        const pull = yield* Stream.toPull(serverAuth.streamProjectVisibility(watched));
        expect(yield* pull).toEqual([{ mode: "all" }]);
        for (const [sessionId, projectId] of [
          [other, beta],
          [watched, alpha],
        ] as const) {
          yield* serverAuth.updateProjectVisibility({
            target: { sessionId },
            projectVisibility: only(projectId),
          });
        }
        expect(yield* pull).toEqual([only(alpha)]);
      }).pipe(Effect.scoped, Effect.provide(layerEnvironmentAuth)),
    );
  },
);
