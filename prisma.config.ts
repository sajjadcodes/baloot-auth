import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Keep Prisma's seed hook aligned with the project's pnpm script.
    seed: 'pnpm db:seed',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
