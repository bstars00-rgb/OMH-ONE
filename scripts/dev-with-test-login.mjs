/**
 * Starts the dev server with the test-support login endpoint enabled.
 *
 * Used by `npm run dev:test` so the route and RBAC test suites can sign in as
 * every seeded role. Cross-platform, so no cross-env dependency is needed.
 *
 * The flag is scoped to this process only — a normal `npm run dev` leaves
 * /api/test-login returning 404.
 */
import { spawn } from 'node:child_process';

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ENABLE_TEST_LOGIN: '1' },
});

child.on('exit', (code) => process.exit(code ?? 0));
