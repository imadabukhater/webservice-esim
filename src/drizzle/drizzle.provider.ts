import { ConfigService } from '@nestjs/config';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './schema';
import { DatabaseConfig } from '../config/configuration';
import { Inject } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
export const DrizzleAsyncProvider = 'DRIZZLE';
export const DrizzleProvider = [
  {
    provide: DrizzleAsyncProvider,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
      const databaseConfig = configService.get<DatabaseConfig>('database')!;
      return drizzle({
        client: createPool({ uri: databaseConfig?.url, connectionLimit: 5 }),
        schema,
        mode: 'default',
      });
    },
  },
];
export const InjectDrizzle = () => Inject(DrizzleAsyncProvider);
export type DatabaseProvider = MySql2Database<typeof schema> & {
  $client: mysql.Pool;
};