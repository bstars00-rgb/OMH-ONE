/**
 * CLI: `npm run db:setup` — apply migrations, then seed if the database is empty.
 * Works against both PGlite (default) and a real Postgres via DATABASE_URL.
 */
import path from 'node:path';
import { getDb } from '../src/lib/db';
import { seed, isSeeded } from './seed';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'database', 'migrations');

async function main() {
  const driver = (process.env.DB_DRIVER ?? (process.env.DATABASE_URL ? 'postgres' : 'pglite')).toLowerCase();
  const db = await getDb();

  console.log(`> applying migrations (driver: ${driver})`);
  if (driver === 'postgres') {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  console.log('> migrations applied');

  if (await isSeeded(db)) {
    console.log('> database already contains data — skipping seed (use `npm run db:reset` to start over)');
  } else {
    console.log('> seeding demo data');
    const result = await seed(db);
    console.log(`> seeded ${result.requests} requests for ${result.employees} employees`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
