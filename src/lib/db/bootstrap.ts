import 'server-only';
import path from 'node:path';
import { getDb, type Database } from './index';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'database', 'migrations');

declare global {
  var __ohmyReady: Promise<Database> | undefined;
}

/**
 * Applies migrations and seeds demo data on first use.
 *
 * Runs once per process (cached on globalThis). Every server page/action awaits
 * this instead of `getDb()` so a fresh clone works with a single `npm run dev` —
 * no manual migrate/seed step required for the demo.
 */
export function ready(): Promise<Database> {
  if (!globalThis.__ohmyReady) {
    globalThis.__ohmyReady = init().then((db) => {
      // Fire-and-forget: the backfill awaits `ready()` itself, which resolves as
      // soon as this callback returns, so it runs after startup rather than
      // blocking the first page render.
      void import('@/lib/ai/review').then((m) => m.backfillAiReviews());
      return db;
    });
  }
  return globalThis.__ohmyReady;
}

async function init(): Promise<Database> {
  const db = await getDb();
  const driver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite')).toLowerCase();

  if (driver === 'postgres') {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  if (process.env.AUTO_SEED !== 'false') {
    const { seed, isSeeded } = await import('../../../database/seed');
    if (!(await isSeeded(db))) {
      console.log('[ohmy] empty database detected — seeding demo data');
      await seed(db);
    }
  }

  return db;
}
