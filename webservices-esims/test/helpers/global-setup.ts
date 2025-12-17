// test/helpers/global-setup.ts
import { config } from 'dotenv';
import { seedDatabase } from './seed-database';

/**
 * Jest global setup - runs once before all test suites.
 * Seeds the test database with initial data.
 */
export default async function globalSetup(): Promise<void> {
  // Load test environment variables (quiet: true suppresses dotenv tips)
  config({ path: '.env.test', quiet: true });

  console.log('\n🌱 Seeding test database...');
  await seedDatabase();
  console.log('✅ Test database seeded successfully\n');
}
