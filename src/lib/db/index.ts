/**
 * Database client.
 *
 * Two drivers, one Postgres schema:
 *   DB_DRIVER=pglite    (default) embedded Postgres persisted to ./.pgdata — zero setup
 *   DB_DRIVER=postgres            Supabase / any Postgres, via DATABASE_URL
 *
 * The rest of the app imports `db` and never learns which driver is live.
 */
import * as schema from './schema';

export type Database = Awaited<ReturnType<typeof createClient>>;

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? './.pgdata';

async function createClient() {
  const driver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite')).toLowerCase();

  if (driver === 'postgres') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DB_DRIVER=postgres requires DATABASE_URL to be set.');
    const [{ drizzle }, postgres] = await Promise.all([
      import('drizzle-orm/postgres-js'),
      import('postgres').then((m) => m.default),
    ]);
    // Supabase pooler does not support prepared statements.
    const sql = postgres(url, { prepare: false, max: 5 });
    return drizzle(sql, { schema, casing: 'snake_case' });
  }

  const [{ PGlite }, { drizzle }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);
  const client = new PGlite(DATA_DIR);
  await client.waitReady;
  return drizzle(client, { schema, casing: 'snake_case' });
}

/**
 * Cached on globalThis so Next.js hot-reload and route-handler isolation do not
 * open a second PGlite handle against the same data directory (which would fail).
 */
declare global {
  var __ohmyDb: Promise<Database> | undefined;
}

export function getDb(): Promise<Database> {
  if (!globalThis.__ohmyDb) globalThis.__ohmyDb = createClient();
  return globalThis.__ohmyDb;
}

export { schema };
