import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  decimal,
  mysqlEnum,
  text,
  date,
  unique,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { Role } from '../auth/role';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
  PaymentStatus,
  PurchaseStatus,
} from '../enums/myenums';
const ESIM_STATUS_VALUES = [
  EsimStatus.AVAILABLE,
  EsimStatus.ASSIGNED,
  EsimStatus.EXPIRED,
] as const;
const PURCHASE_STATUS_VALUES = [
  PurchaseStatus.PENDING,
  PurchaseStatus.CODE_SENT,
  PurchaseStatus.ACTIVATED,
  PurchaseStatus.EXPIRED,
] as const;
const PAYMENT_STATUS_VALUES = [
  PaymentStatus.PENDING,
  PaymentStatus.COMPLETED,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
] as const;
const ADMIN_ACTION_CATEGORY_VALUES = [
  AdminActionCategory.ESIM,
  AdminActionCategory.PLAN,
  AdminActionCategory.PROVIDER,
  AdminActionCategory.CUSTOMER,
  AdminActionCategory.PURCHASE,
] as const;
const ADMIN_ACTION_TYPE_VALUES = [
  AdminActionType.UPDATE,
  AdminActionType.DELETE,
  AdminActionType.CREATE,
] as const;
export type User = typeof users.$inferInsert;
export type EsimPurchase = typeof esimPurchases.$inferInsert;
export const users = mysqlTable('User', {
  user_id: int('user_id').primaryKey().autoincrement(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  full_name: varchar('full_name', { length: 100 }).notNull(),
  phone_number: varchar('phone_number', { length: 20 }),
  role: mysqlEnum('role', [Role.CUSTOMER, Role.ADMIN]).notNull(),
  is_verified: boolean('is_verified').default(false),
  last_login: timestamp('last_login'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});
export const providers = mysqlTable('Provider', {
  provider_id: int('provider_id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  logo_url: varchar('logo_url', { length: 255 }),
  is_active: boolean('is_active').default(true),
  description: text('description'),
});
export const plans = mysqlTable('Plan', {
  plan_id: int('plan_id').primaryKey().autoincrement(),
  provider_id: int('provider_id')
    .notNull()
    .references(() => providers.provider_id, { onDelete: 'cascade' }),
  plan_name: varchar('plan_name', { length: 100 }).notNull(),
  data_amount_gb: int('data_amount_gb').notNull(),
  call_minutes: int('call_minutes').default(0),
  sms_count: int('sms_count').default(0),
  validity_days: int('validity_days').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').default(true),
});
export const esims = mysqlTable('ESIM', {
  esim_id: int('esim_id').primaryKey().autoincrement(),
  plan_id: int('plan_id')
    .notNull()
    .references(() => plans.plan_id, { onDelete: 'cascade' }),
  phone_number: varchar('phone_number', { length: 20 }).notNull().unique(),
  iccid: varchar('iccid', { length: 50 }).notNull().unique(),
  qr_code: text('qr_code').notNull(),
  status: mysqlEnum('status', ESIM_STATUS_VALUES).default(EsimStatus.AVAILABLE),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});
export const esimPurchases = mysqlTable('ESIMPurchase', {
  esim_purchase_id: int('esim_purchase_id').primaryKey().autoincrement(),
  customer_id: int('customer_id')
    .notNull()
    .references(() => users.user_id, { onDelete: 'cascade' }),
  plan_id: int('plan_id')
    .notNull()
    .references(() => plans.plan_id, { onDelete: 'restrict' }),
  esim_id: int('esim_id')
    .unique()
    .references(() => esims.esim_id, { onDelete: 'set null' }),
  order_number: varchar('order_number', { length: 50 }).notNull().unique(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('EUR'),
  purchase_status: mysqlEnum('purchase_status', PURCHASE_STATUS_VALUES).default(
    PurchaseStatus.PENDING,
  ),
  payment_status: mysqlEnum('payment_status', PAYMENT_STATUS_VALUES).default(
    PaymentStatus.PENDING,
  ),
  payment_method: varchar('payment_method', { length: 20 })
    .notNull()
    .default('paypal'),
  payment_reference: varchar('payment_reference', { length: 100 }).unique(),
  transaction_id: varchar('transaction_id', { length: 100 }).unique(),
  sent_at: timestamp('sent_at'),
  activation_date: timestamp('activation_date'),
  expiry_date: date('expiry_date').notNull(),
  purchase_date: timestamp('purchase_date').defaultNow(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});
export const adminActions = mysqlTable('AdminAction', {
  action_id: int('action_id').primaryKey().autoincrement(),
  admin_id: int('admin_id')
    .notNull()
    .references(() => users.user_id, { onDelete: 'cascade' }),
  action_category: mysqlEnum(
    'action_category',
    ADMIN_ACTION_CATEGORY_VALUES,
  ).notNull(),
  action_type: mysqlEnum('action_type', ADMIN_ACTION_TYPE_VALUES).notNull(),
  entity_id: int('entity_id').notNull(),
  notes: text('notes'),
  performed_at: timestamp('performed_at').defaultNow(),
});
export const customerFavoritePlans = mysqlTable(
  'CustomerFavoritePlan',
  {
    favorite_id: int('favorite_id').primaryKey().autoincrement(),
    customer_id: int('customer_id')
      .notNull()
      .references(() => users.user_id, { onDelete: 'cascade' }),
    plan_id: int('plan_id')
      .notNull()
      .references(() => plans.plan_id, { onDelete: 'cascade' }),
    added_at: timestamp('added_at').defaultNow(),
  },
  (table) => ({
    uniqueCustomerPlan: unique().on(table.customer_id, table.plan_id),
  }),
);
export const passwordResets = mysqlTable('PasswordReset', {
  id: int('id').primaryKey().autoincrement(),
  user_id: int('user_id')
    .notNull()
    .references(() => users.user_id, { onDelete: 'cascade' }),
  token_hash: varchar('token_hash', { length: 255 }).notNull(),
  expires_at: timestamp('expires_at').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});
export const usersRelations = relations(users, ({ many }) => ({
  purchases: many(esimPurchases),
  favoritePlans: many(customerFavoritePlans),
  actions: many(adminActions),
}));
export const providersRelations = relations(providers, ({ many }) => ({
  plans: many(plans),
}));
export const plansRelations = relations(plans, ({ one, many }) => ({
  provider: one(providers, {
    fields: [plans.provider_id],
    references: [providers.provider_id],
  }),
  esims: many(esims),
  favoritedBy: many(customerFavoritePlans),
}));
export const esimsRelations = relations(esims, ({ one }) => ({
  plan: one(plans, {
    fields: [esims.plan_id],
    references: [plans.plan_id],
  }),
  purchase: one(esimPurchases, {
    fields: [esims.esim_id],
    references: [esimPurchases.esim_id],
  }),
}));
export const esimPurchasesRelations = relations(esimPurchases, ({ one }) => ({
  customer: one(users, {
    fields: [esimPurchases.customer_id],
    references: [users.user_id],
  }),
  esim: one(esims, {
    fields: [esimPurchases.esim_id],
    references: [esims.esim_id],
  }),
}));
export const adminActionsRelations = relations(adminActions, ({ one }) => ({
  admin: one(users, {
    fields: [adminActions.admin_id],
    references: [users.user_id],
  }),
}));
export const customerFavoritePlansRelations = relations(
  customerFavoritePlans,
  ({ one }) => ({
    customer: one(users, {
      fields: [customerFavoritePlans.customer_id],
      references: [users.user_id],
    }),
    plan: one(plans, {
      fields: [customerFavoritePlans.plan_id],
      references: [plans.plan_id],
    }),
  }),
);

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, { fields: [passwordResets.user_id], references: [users.user_id] }),
}));
