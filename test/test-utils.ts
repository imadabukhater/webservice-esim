// test/test-utils.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Re-export helpers from dedicated files
export { createApp } from './helpers/create-app';
export {
  seedDatabase,
  resetDatabase,
  TEST_DATA,
} from './helpers/seed-database';

/**
 * Gets an authentication token for a user
 */
export async function getAuthToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/sessions')
    .send({ email, password });

  return response.body.token;
}

/**
 * Gets admin authentication token
 */
export async function getAdminToken(app: INestApplication): Promise<string> {
  return getAuthToken(app, 'admin@esims.com', 'AdminPass123!');
}

/**
 * Gets customer authentication token
 */
export async function getCustomerToken(app: INestApplication): Promise<string> {
  return getAuthToken(app, 'customer1@test.com', 'CustomerPass123!');
}

/**
 * Test credentials for seeded data
 */
export const TEST_CREDENTIALS = {
  admin: {
    email: 'admin@esims.com',
    password: 'AdminPass123!',
  },
  customer1: {
    email: 'customer1@test.com',
    password: 'CustomerPass123!',
  },
  customer2: {
    email: 'customer2@test.com',
    password: 'CustomerPass123!',
  },
};

/**
 * Generates a unique email for test registration
 */
export function generateUniqueEmail(prefix = 'test'): string {
  return `${prefix}.${Date.now()}@example.com`;
}

/**
 * Generates a unique ICCID for eSIM creation
 */
export function generateUniqueIccid(): string {
  return `899${Date.now()}`;
}

/**
 * Generates a unique phone number for eSIM creation
 */
export function generateUniquePhoneNumber(): string {
  return `+32${Date.now().toString().slice(-9)}`;
}

/**
 * Generates a future date for order expiry
 */
export function generateFutureDate(monthsAhead = 1): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead);
  return date.toISOString().split('T')[0];
}
