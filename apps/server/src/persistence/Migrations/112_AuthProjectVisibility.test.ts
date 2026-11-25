import { assert, it } from "@effect/vitest";
import { AuthSessionId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import * as AuthPairingLinks from "../AuthPairingLinks.ts";
import * as AuthSessions from "../AuthSessions.ts";
import { runMigrations } from "../Migrations.ts";

const layer = it.layer(
  Layer.mergeAll(AuthPairingLinks.layer, AuthSessions.layer).pipe(
    Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
  ),
);

layer("112_AuthProjectVisibility", (it) => {
  it.effect("leaves paired devices and unused links showing every project", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 111 });
      yield* sql`
        INSERT INTO auth_pairing_links
          (id, credential, method, scopes, subject, created_at, expires_at)
        VALUES (
          'old-link', 'OLDCREDENTIAL', 'one-time-token', '["orchestration:read"]',
          'one-time-token', '2026-11-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z'
        )
      `;
      yield* sql`
        INSERT INTO auth_sessions
          (session_id, subject, scopes, method, client_device_type, issued_at, expires_at)
        VALUES (
          'old-session', 'one-time-token', '["orchestration:read"]', 'browser-session-cookie',
          'desktop', '2026-11-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 112 });

      const now = yield* DateTime.now;
      const links = yield* AuthPairingLinks.AuthPairingLinkRepository;
      const sessions = yield* AuthSessions.AuthSessionRepository;
      const [link] = yield* links.listActive({ now });
      const session = yield* sessions.getById({ sessionId: AuthSessionId.make("old-session") });
      // Null is "every project", including ones created after the upgrade.
      assert.strictEqual(link?.projectVisibility, null);
      assert.strictEqual(Option.getOrThrow(session).projectVisibility, null);

      // An unreadable value must not make the device or the link disappear.
      yield* sql`UPDATE auth_sessions SET project_visibility = 'not json'`;
      yield* sql`UPDATE auth_pairing_links SET project_visibility = '{"mode":"some-day"}'`;
      assert.strictEqual((yield* links.listActive({ now }))[0]?.projectVisibility, null);
      assert.strictEqual((yield* sessions.listActive({ now }))[0]?.projectVisibility, null);
    }),
  );
});
