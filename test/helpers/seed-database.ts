// test/helpers/seed-database.ts
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from '../../src/drizzle/schema';
import * as argon2 from 'argon2';
import { Role } from '../../src/auth/role';
import {
  EsimStatus,
  PaymentStatus,
  PurchaseStatus,
} from '../../src/enums/myenums';

/**
 * Hash password using argon2id (same as production)
 */
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    hashLength: 32,
    timeCost: 2,
    memoryCost: 2 ** 16,
  });
}

/**
 * Test data constants - use these in your tests
 */
export const TEST_DATA = {
  admin: {
    email: 'admin@esims.com',
    password: 'AdminPass123!',
    full_name: 'Admin User',
    phone_number: '+32123456789',
  },
  customer1: {
    email: 'customer1@test.com',
    password: 'CustomerPass123!',
    full_name: 'Customer One',
    phone_number: '+32987654321',
  },
  customer2: {
    email: 'customer2@test.com',
    password: 'CustomerPass123!',
    full_name: 'Customer Two',
    phone_number: '+32456789123',
  },
  providers: [
    {
      name: 'Provider 1',
      logo_url: 'https://example.com/provider1-logo.png',
      description: 'First test provider',
    },
    {
      name: 'Provider 2',
      logo_url: 'https://example.com/provider2-logo.png',
      description: 'Second test provider',
    },
    {
      name: 'Provider 3',
      logo_url: 'https://example.com/provider3-logo.png',
      description: 'Third test provider',
    },
  ],
};

/**
 * Seeded IDs - populated after seedDatabase() runs.
 * Use these in tests instead of hardcoded IDs.
 */
export const SEEDED_IDS = {
  users: {
    adminId: 0,
    customer1Id: 0,
    customer2Id: 0,
  },
  providers: [] as number[],
  plans: [] as number[],
  esims: [] as number[],
  orders: [] as number[],
};

/**
 * Seeds the test database with initial data.
 * Should be called before running tests.
 */
export async function seedDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const connection = mysql.createPool({ uri: databaseUrl });
  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    // Reset database (delete in correct order for foreign keys)
    await db.delete(schema.customerFavoritePlans);
    await db.delete(schema.adminActions);
    await db.delete(schema.esimPurchases);
    await db.delete(schema.esims);
    await db.delete(schema.plans);
    await db.delete(schema.providers);
    await db.delete(schema.users);

    // Hash passwords
    const adminPasswordHash = await hashPassword(TEST_DATA.admin.password);
    const customerPasswordHash = await hashPassword(
      TEST_DATA.customer1.password,
    );

    // Insert users
    const insertedUsers = await db
      .insert(schema.users)
      .values([
        {
          email: TEST_DATA.admin.email,
          password_hash: adminPasswordHash,
          full_name: TEST_DATA.admin.full_name,
          phone_number: TEST_DATA.admin.phone_number,
          role: Role.ADMIN,
          is_active: true,
        },
        {
          email: TEST_DATA.customer1.email,
          password_hash: customerPasswordHash,
          full_name: TEST_DATA.customer1.full_name,
          phone_number: TEST_DATA.customer1.phone_number,
          role: Role.CUSTOMER,
          is_active: true,
          is_verified: true,
        },
        {
          email: TEST_DATA.customer2.email,
          password_hash: customerPasswordHash,
          full_name: TEST_DATA.customer2.full_name,
          phone_number: TEST_DATA.customer2.phone_number,
          role: Role.CUSTOMER,
          is_active: true,
          is_verified: true,
        },
      ])
      .$returningId();

    // Store user IDs
    SEEDED_IDS.users.adminId = insertedUsers[0].user_id;
    SEEDED_IDS.users.customer1Id = insertedUsers[1].user_id;
    SEEDED_IDS.users.customer2Id = insertedUsers[2].user_id;

    // Insert providers
    const insertedProviders = await db
      .insert(schema.providers)
      .values(
        TEST_DATA.providers.map((p) => ({
          name: p.name,
          logo_url: p.logo_url,
          description: p.description,
          is_active: true,
        })),
      )
      .$returningId();

    // Store provider IDs
    SEEDED_IDS.providers = insertedProviders.map((p) => p.provider_id);

    // Insert plans
    const insertedPlans = await db
      .insert(schema.plans)
      .values([
        {
          provider_id: insertedProviders[0].provider_id,
          plan_name: 'Plan 1 - Basic 5GB',
          data_amount_gb: 5,
          call_minutes: 100,
          sms_count: 50,
          validity_days: 30,
          price: '19.99',
          description: 'Basic plan with 5GB data',
          is_active: true,
        },
        {
          provider_id: insertedProviders[0].provider_id,
          plan_name: 'Plan 2 - Premium 20GB',
          data_amount_gb: 20,
          call_minutes: 500,
          sms_count: 200,
          validity_days: 30,
          price: '39.99',
          description: 'Premium plan with 20GB data',
          is_active: true,
        },
        {
          provider_id: insertedProviders[1].provider_id,
          plan_name: 'Plan 3 - Unlimited 50GB',
          data_amount_gb: 50,
          call_minutes: 0,
          sms_count: 0,
          validity_days: 30,
          price: '49.99',
          description: 'Unlimited plan with 50GB data',
          is_active: true,
        },
        {
          provider_id: insertedProviders[1].provider_id,
          plan_name: 'Plan 4 - Tourist 10GB',
          data_amount_gb: 10,
          call_minutes: 200,
          sms_count: 100,
          validity_days: 15,
          price: '24.99',
          description: 'Tourist plan with 10GB data',
          is_active: true,
        },
        {
          provider_id: insertedProviders[2].provider_id,
          plan_name: 'Plan 5 - Business 30GB',
          data_amount_gb: 30,
          call_minutes: 1000,
          sms_count: 500,
          validity_days: 30,
          price: '59.99',
          description: 'Business plan with 30GB data',
          is_active: true,
        },
      ])
      .$returningId();

    // Store plan IDs
    SEEDED_IDS.plans = insertedPlans.map((p) => p.plan_id);

    // Insert eSIMs
    const insertedEsims = await db
      .insert(schema.esims)
      .values([
        {
          plan_id: insertedPlans[0].plan_id,
          phone_number: '+32470123456',
          iccid: '8932123456789012345',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-1234$OPTIONAL',
          status: EsimStatus.AVAILABLE,
        },
        {
          plan_id: insertedPlans[0].plan_id,
          phone_number: '+32470123457',
          iccid: '8932123456789012346',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-2345$OPTIONAL',
          status: EsimStatus.AVAILABLE,
        },
        {
          plan_id: insertedPlans[1].plan_id,
          phone_number: '+32470234567',
          iccid: '8932234567890123456',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-3456$OPTIONAL',
          status: EsimStatus.ASSIGNED,
        },
        {
          plan_id: insertedPlans[2].plan_id,
          phone_number: '+33612345678',
          iccid: '8933345678901234567',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-4567$OPTIONAL',
          status: EsimStatus.AVAILABLE,
        },
        {
          plan_id: insertedPlans[3].plan_id,
          phone_number: '+34612345678',
          iccid: '8934456789012345678',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-5678$OPTIONAL',
          status: EsimStatus.AVAILABLE,
        },
        {
          plan_id: insertedPlans[4].plan_id,
          phone_number: '+49151234567',
          iccid: '8949567890123456789',
          qr_code: 'LPA:1$example.com$ACTIVATION-CODE-6789$OPTIONAL',
          status: EsimStatus.AVAILABLE,
        },
      ])
      .$returningId();

    // Store eSIM IDs
    SEEDED_IDS.esims = insertedEsims.map((e) => e.esim_id);

    // Insert purchases/orders
    const insertedOrders = await db
      .insert(schema.esimPurchases)
      .values([
        {
          customer_id: insertedUsers[1].user_id,
          plan_id: insertedPlans[1].plan_id,
          esim_id: insertedEsims[2].esim_id,
          order_number: 'ORD-2025-001',
          amount: '39.99',
          currency: 'EUR',
          purchase_status: PurchaseStatus.ACTIVATED,
          payment_status: PaymentStatus.COMPLETED,
          payment_method: 'paypal',
          payment_reference: 'PAYPAL-REF-123456',
          transaction_id: 'TXN-ABC123456',
          sent_at: new Date('2025-10-01'),
          activation_date: new Date('2025-10-01'),
          expiry_date: new Date('2025-10-31'),
        },
        {
          customer_id: insertedUsers[2].user_id,
          plan_id: insertedPlans[0].plan_id,
          esim_id: null,
          order_number: 'ORD-2025-002',
          amount: '24.99',
          currency: 'EUR',
          purchase_status: PurchaseStatus.PENDING,
          payment_status: PaymentStatus.PENDING,
          payment_method: 'credit_card',
          expiry_date: new Date('2025-11-15'),
        },
      ])
      .$returningId();

    // Store order IDs
    SEEDED_IDS.orders = insertedOrders.map((o) => o.esim_purchase_id);

    // Insert customer favorites
    await db.insert(schema.customerFavoritePlans).values([
      {
        customer_id: insertedUsers[1].user_id,
        plan_id: insertedPlans[0].plan_id,
      },
      {
        customer_id: insertedUsers[1].user_id,
        plan_id: insertedPlans[2].plan_id,
      },
      {
        customer_id: insertedUsers[2].user_id,
        plan_id: insertedPlans[1].plan_id,
      },
    ]);

    // Write IDs to a file so tests can read them
    const fs = await import('fs');
    fs.writeFileSync(
      './test/helpers/seeded-ids.json',
      JSON.stringify(SEEDED_IDS, null, 2),
    );
  } finally {
    await connection.end();
  }
}

/**
 * Resets the test database by deleting all data.
 * Useful for cleaning up after tests.
 */
export async function resetDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const connection = mysql.createPool({ uri: databaseUrl });
  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    await db.delete(schema.customerFavoritePlans);
    await db.delete(schema.adminActions);
    await db.delete(schema.esimPurchases);
    await db.delete(schema.esims);
    await db.delete(schema.plans);
    await db.delete(schema.providers);
    await db.delete(schema.users);
  } finally {
    await connection.end();
  }
}
