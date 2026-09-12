// The outbox's storage (#45). SQLite over MMKV: this is a real queue with
// retry/backoff state and needs to be queried/filtered ("give me pending
// rows whose backoff has elapsed, oldest first"), not just key-value reads
// — that's a WHERE clause and an ORDER BY, not a KV lookup. expo-sqlite is
// also fully Expo-managed (no extra native-linking surface beyond what
// `expo install` already handles), which matters more than usual here:
// this session has no device to catch a broken native module on.
import * as SQLite from "expo-sqlite";

let dbPromise: ReturnType<typeof SQLite.openDatabaseAsync> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("outbox.db").then(async (db) => {
      await db.execAsync(`
        create table if not exists outbox_operations (
          id text primary key,
          kind text not null,
          payload text not null,
          status text not null default 'pending',
          attempt_count integer not null default 0,
          next_attempt_at integer not null default 0,
          last_error text,
          created_at integer not null
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
