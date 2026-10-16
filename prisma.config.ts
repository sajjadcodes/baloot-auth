import 'dotenv/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as definePostgresConfig } from '@prisma/orm-postgres/config';

const ormConfig: object = definePostgresConfig({
  contract: './src/prisma/contract.prisma',
  db: {
    connection: process.env['DATABASE_URL']!,
  },
});

export default definePrismaConfig({ orm: ormConfig });
