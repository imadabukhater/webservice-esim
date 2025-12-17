import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as schema from './schema';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { Role } from '../auth/role';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
  PaymentStatus,
  PurchaseStatus,
} from '../enums/myenums';

if (!process.env.DATABASE_URL) {
  config();
}

const connection = mysql.createPool({
  uri: process.env.DATABASE_URL,
});
const db = drizzle(connection, {
  schema,
  mode: 'default',
});
async function resetDatabase() {
  console.log('🗑️ Resetting database...');
  // Delete in correct order (respecting foreign keys)
  await db.delete(schema.customerFavoritePlans);
  await db.delete(schema.adminActions);
  await db.delete(schema.esimPurchases);
  await db.delete(schema.esims);
  await db.delete(schema.plans);
  await db.delete(schema.providers);
  // customers/admins tables removed (merged into users)
  await db.delete(schema.users);
  console.log('✅ Database reset completed\n');
}
async function hashPassword(password: string): Promise<string> {
  // 👇 2
  return argon2.hash(password, {
    type: argon2.argon2id, // 👈 3
    hashLength: 32, // 👈 4
    timeCost: 2, // 👈 5
    memoryCost: 2 ** 16, // 👈 6
  });
}
async function seedDatabase() {
  console.log('🌱 Seeding database...');
  console.log('👤 Inserting users...');
  const adminPasswordHash = await hashPassword('AdminPass123!');
  const customerPassHash = await hashPassword('CustomerPass123!');
  const insertedUsers = await db
    .insert(schema.users)
    .values([
      {
        email: 'admin@esims.com',
        password_hash: adminPasswordHash,
        full_name: 'Admin User',
        phone_number: '+32123456789',
        role: Role.ADMIN,
        is_active: true,
      },
      {
        email: 'customer1@test.com',
        password_hash: customerPassHash,
        full_name: 'Customer One',
        phone_number: '+32987654321',
        role: Role.CUSTOMER,
        is_active: true,
      },
      {
        email: 'customer2@test.com',
        password_hash: customerPassHash,
        full_name: 'Customer Two',
        phone_number: '+32456789123',
        role: Role.CUSTOMER,
        is_active: true,
      },
    ])
    .$returningId();
  console.log(`✅ Inserted ${insertedUsers.length} users`);
  // Insert Admin
  console.log('👨‍💼 Inserting admins...');
  // set role-specific metadata on users (is_verified / last_login were stored on users after merge)
  await db
    .update(schema.users)
    .set({ is_verified: true })
    .where(eq(schema.users.user_id, insertedUsers[1].user_id));
  await db
    .update(schema.users)
    .set({ is_verified: true })
    .where(eq(schema.users.user_id, insertedUsers[2].user_id));
  // Insert Providers
  console.log('📡 Inserting providers...');
  const insertedProviders = await db
    .insert(schema.providers)
    .values([
      {
        name: 'Provider 1',
        logo_url: 'https://example.com/provider1-logo.png',
        is_active: true,
        description: 'First test provider',
      },
      {
        name: 'Provider 2',
        logo_url: 'https://example.com/provider2-logo.png',
        is_active: true,
        description: 'Second test provider',
      },
      {
        name: 'Provider 3',
        logo_url: 'https://example.com/provider3-logo.png',
        is_active: true,
        description: 'Third test provider',
      },
    ])
    .$returningId();
  console.log(`✅ Inserted ${insertedProviders.length} providers`);
  // Insert Plans
  console.log('📋 Inserting plans...');
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
  console.log(`✅ Inserted ${insertedPlans.length} plans`);
  // Insert ESIMs
  console.log('📱 Inserting eSIMs...');
  const insertedEsims = await db
    .insert(schema.esims)
    .values([
      {
        plan_id: insertedPlans[0].plan_id,
        phone_number: '+32470123456',
        iccid: '8932123456789012345',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-1234-5678-90AB-CDEF$OPTIONAL',
        status: EsimStatus.AVAILABLE,
      },
      {
        plan_id: insertedPlans[0].plan_id,
        phone_number: '+32470123457',
        iccid: '8932123456789012346',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-2345-6789-01BC-DEFG$OPTIONAL',
        status: EsimStatus.AVAILABLE,
      },
      {
        plan_id: insertedPlans[1].plan_id,
        phone_number: '+32470234567',
        iccid: '8932234567890123456',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-3456-7890-12CD-EFGH$OPTIONAL',
        status: EsimStatus.ASSIGNED,
      },
      {
        plan_id: insertedPlans[2].plan_id,
        phone_number: '+33612345678',
        iccid: '8933345678901234567',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-4567-8901-23DE-FGHI$OPTIONAL',
        status: EsimStatus.AVAILABLE,
      },
      {
        plan_id: insertedPlans[3].plan_id,
        phone_number: '+34612345678',
        iccid: '8934456789012345678',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-5678-9012-34EF-GHIJ$OPTIONAL',
        status: EsimStatus.AVAILABLE,
      },
      {
        plan_id: insertedPlans[4].plan_id,
        phone_number: '+49151234567',
        iccid: '8949567890123456789',
        qr_code:
          'LPA:1$example.com$ACTIVATION-CODE-6789-0123-45FG-HIJK$OPTIONAL',
        status: EsimStatus.AVAILABLE,
      },
    ])
    .$returningId();
  console.log(`✅ Inserted ${insertedEsims.length} eSIMs`);
  // Insert ESIM Purchases (Orders)
  console.log('🛒 Inserting eSIM purchases...');
  const insertedPurchases = await db
    .insert(schema.esimPurchases)
    .values([
      {
        customer_id: insertedUsers[1].user_id,
        plan_id: insertedPlans[1].plan_id, // eSIM[2] belongs to plan[1]
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
        plan_id: insertedPlans[0].plan_id, // Pending order for plan[0]
        esim_id: null, // No eSIM assigned yet (payment pending)
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
  console.log(`✅ Inserted ${insertedPurchases.length} purchases`);
  // Insert Admin Actions
  console.log('📝 Inserting admin actions...');
  const insertedActions = await db
    .insert(schema.adminActions)
    .values([
      {
        admin_id: insertedUsers[0].user_id,
        action_category: AdminActionCategory.ESIM,
        action_type: AdminActionType.CREATE,
        entity_id: insertedEsims[0].esim_id,
        notes: 'Created new eSIM for Vodafone Basic plan',
      },
      {
        admin_id: insertedUsers[0].user_id,
        action_category: AdminActionCategory.PLAN,
        action_type: AdminActionType.UPDATE,
        entity_id: insertedPlans[0].plan_id,
        notes: 'Updated pricing for Europe Basic 5GB plan',
      },
      {
        admin_id: insertedUsers[0].user_id,
        action_category: AdminActionCategory.PROVIDER,
        action_type: AdminActionType.CREATE,
        entity_id: insertedProviders[0].provider_id,
        notes: 'Added Vodafone as new provider',
      },
    ])
    .$returningId();
  console.log(`✅ Inserted ${insertedActions.length} admin actions`);
  // Insert Customer Favorite Plans
  console.log('⭐ Inserting favorite plans...');
  const insertedFavorites = await db
    .insert(schema.customerFavoritePlans)
    .values([
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
      {
        customer_id: insertedUsers[2].user_id,
        plan_id: insertedPlans[3].plan_id,
      },
    ])
    .$returningId();
  console.log(`✅ Inserted ${insertedFavorites.length} favorite plans`);
  console.log('\n✨ Database seeding completed successfully!\n');
}
async function main() {
  try {
    await resetDatabase();
    await seedDatabase();
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await connection.end();
    process.exit(0);
  }
}
void main();
