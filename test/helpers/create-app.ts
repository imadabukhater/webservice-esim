// test/helpers/create-app.ts
import { config } from 'dotenv';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/lib/http-exception.filter';
import { ValidationError } from 'class-validator';

// Load test environment variables (quiet: true suppresses dotenv tips)
config({ path: '.env.test', quiet: true });

/**
 * Creates and initializes a NestJS test application with the same
 * configuration as the production app (from main.ts).
 *
 * This includes:
 * - Global prefix 'api'
 * - ValidationPipe with whitelist, transform, and custom error formatting
 * - HttpExceptionFilter for consistent error responses
 * - Logger disabled for clean test output
 */
export async function createApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Disable logging during tests
  app.useLogger(false);

  // Set global prefix (same as main.ts)
  app.setGlobalPrefix('api');

  // Use the same exception filter as main.ts
  app.useGlobalFilters(new HttpExceptionFilter());

  // Use the same validation pipe configuration as main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: (errors: ValidationError[] = []) => {
        const formattedErrors = errors.reduce(
          (acc, err) => {
            acc[err.property] = Object.values(err.constraints || {});
            return acc;
          },
          {} as Record<string, string[]>,
        );
        return new BadRequestException({
          details: { body: formattedErrors },
        });
      },
    }),
  );

  await app.init();

  return app;
}
