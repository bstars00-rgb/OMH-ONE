import { defineConfig } from 'drizzle-kit';

/**
 * Generates plain PostgreSQL migrations from src/lib/db/schema.ts.
 * The same SQL runs against embedded PGlite locally and Supabase in production —
 * `npm run db:generate` then paste database/migrations/*.sql into the Supabase SQL editor,
 * or point DATABASE_URL at Supabase and run `npm run db:migrate`.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './database/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/ohmy',
  },
  verbose: true,
  strict: false,
});
