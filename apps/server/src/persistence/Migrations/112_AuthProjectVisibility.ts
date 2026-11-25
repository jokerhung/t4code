import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // NULL means every project, so existing links and sessions need no backfill. Writing today's
  // project ids into them would hide every project created later.
  yield* sql`ALTER TABLE auth_pairing_links ADD COLUMN project_visibility TEXT`;
  yield* sql`ALTER TABLE auth_sessions ADD COLUMN project_visibility TEXT`;
});
