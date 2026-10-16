import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../prisma/contract.d.js';
import contractJson from '../prisma/contract.json' with { type: 'json' };

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: ReturnType<typeof postgres<Contract>>;

  get public(): PrismaService['client']['orm']['public'] {
    return this.client.orm.public;
  }

  constructor(config: ConfigService) {
    this.client = postgres<Contract>({
      contractJson,
      url: config.getOrThrow<string>('DATABASE_URL'),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.public.Client.where({
      id: '00000000-0000-0000-0000-000000000000',
    }).first();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
