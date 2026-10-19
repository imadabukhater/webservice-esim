import {
  mysqlTable,
  decimal,
  int,
  varchar,
  boolean,
  timestamp,
  mysqlEnum,
  text,
  date,
  unique,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { Role } from '../auth/role';
import {
  AdminActionCategory,
  AdminActionType,
  BalanceTransactionKind,
  EsimStatus,
  PaymentClaimPurpose,
  PaymentClaimStatus,
  PaymentStatus,
  PurchaseStatus,
  PurchaseType,
  WalletTransactionSource,
  WalletTransactionStatus,
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
const WALLET_TRANSACTION_SOURCE_VALUES = [
  WalletTransactionSource.MAIL,
  WalletTransactionSource.WEBHOOK,
  WalletTransactionSource.MANUAL,
] as const;
const WALLET_TRANSACTION_STATUS_VALUES = [
  WalletTransactionStatus.UNMATCHED,
  WalletTransactionStatus.MATCHED,
  WalletTransactionStatus.IGNORED,
] as const;
const PAYMENT_CLAIM_STATUS_VALUES = [
  PaymentClaimStatus.PENDING,
  PaymentClaimStatus.MATCHED,
  PaymentClaimStatus.REJECTED,
] as const;
const PURCHASE_TYPE_VALUES = [
  PurchaseType.NEW,
  PurchaseType.RENEWAL,
  PurchaseType.EXTENSION,
] as const;
const PAYMENT_CLAIM_PURPOSE_VALUES = [
  PaymentClaimPurpose.ORDER,
  PaymentClaimPurpose.TOPUP,
] as const;
const BALANCE_TRANSACTION_KIND_VALUES = [
  BalanceTransactionKind.TOPUP,
  BalanceTransactionKind.PURCHASE,
  BalanceTransactionKind.REFUND,
  BalanceTransactionKind.ADJUSTMENT,
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
  // Prepaid balance in whole currency units (see BalanceTransaction ledger)
  balance: int('balance').notNull().default(0),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});
export const providers = mysqlTable('Provider', {
  provider_id: int('provider_id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  logo_url: varchar('logo_url', { length: 255 }),
  is_active: boolean('is_active').default(true),
  // Shown in the customer store
  is_visible: boolean('is_visible').notNull().default(true),
  // Price of a new eSIM QR from this provider, added to every new purchase
  qr_price: int('qr_price').notNull().default(0),
  // Default renewal / extension price for this provider's plans (NULL: plan price)
  renewal_price: int('renewal_price'),
  description: text('description'),
});
export const plans = mysqlTable(
  'Plan',
  {
    plan_id: int('plan_id').primaryKey().autoincrement(),
    provider_id: int('provider_id')
      .notNull()
      .references(() => providers.provider_id, { onDelete: 'cascade' }),
    plan_name: varchar('plan_name', { length: 100 }).notNull(),
    data_amount_gb: int('data_amount_gb').notNull(),
    call_minutes: int('call_minutes').default(0),
    sms_count: int('sms_count').default(0),
    validity_days: int('validity_days').notNull(),
    // Whole currency units only (no fils), e.g. 20 ILS
    price: int('price').notNull(),
    // Renewal / extension price; NULL falls back to the provider, then price
    renewal_price: int('renewal_price'),
    description: text('description'),
    is_active: boolean('is_active').default(true),
    // Shown to customers in the store
    is_visible: boolean('is_visible').notNull().default(true),
    // Show the QR code to the customer right after payment / activation
    show_qr: boolean('show_qr').notNull().default(true),
  },
  (table) => [
    // One plan name per provider: no duplicated packages
    unique('Plan_provider_name_unique').on(table.provider_id, table.plan_name),
  ],
);
export const esims = mysqlTable('ESIM', {
  esim_id: int('esim_id').primaryKey().autoincrement(),
  // eSIM QR inventory belongs to the provider, so plans can be re-synced
  provider_id: int('provider_id')
    .notNull()
    .references(() => providers.provider_id, { onDelete: 'cascade' }),
  // Plan the eSIM was loaded with (set on assignment); kept when plans change
  plan_id: int('plan_id').references(() => plans.plan_id, {
    onDelete: 'set null',
  }),
  phone_number: varchar('phone_number', { length: 20 }).notNull().unique(),
  iccid: varchar('iccid', { length: 50 }).notNull().unique(),
  qr_code: text('qr_code').notNull(),
  status: mysqlEnum('status', ESIM_STATUS_VALUES).default(EsimStatus.AVAILABLE),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});
export const esimPurchases = mysqlTable(
  'ESIMPurchase',
  {
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
    // Whole currency units only (no fils); includes qr_fee
    amount: int('amount').notNull(),
    // Provider QR price charged for a new eSIM (0 for renewals)
    qr_fee: int('qr_fee').notNull().default(0),
    currency: varchar('currency', { length: 3 }).default('ILS'),
    purchase_type: mysqlEnum('purchase_type', PURCHASE_TYPE_VALUES)
      .notNull()
      .default(PurchaseType.NEW),
    // For renewal / extension orders: the original purchase (same eSIM line)
    renews_purchase_id: int('renews_purchase_id'),
    purchase_status: mysqlEnum(
      'purchase_status',
      PURCHASE_STATUS_VALUES,
    ).default(PurchaseStatus.PENDING),
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
  },
  (table) => [
    foreignKey({
      name: 'ESIMPurchase_renews_fk',
      columns: [table.renews_purchase_id],
      foreignColumns: [table.esim_purchase_id],
    }).onDelete('set null'),
  ],
);
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
/**
 * Incoming wallet transfers (e.g. Jawwal Pay) detected from the Gmail
 * notification e-mails, a webhook or manual admin entry. Each notification
 * carries a unique reference number which is used for de-duplication.
 */
export const walletTransactions = mysqlTable(
  'WalletTransaction',
  {
    wallet_transaction_id: int('wallet_transaction_id')
      .primaryKey()
      .autoincrement(),
    provider: varchar('provider', { length: 30 })
      .notNull()
      .default('jawwal_pay'),
    reference: varchar('reference', { length: 100 }).notNull().unique(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('ILS'),
    sender_name: varchar('sender_name', { length: 150 }),
    sender_name_normalized: varchar('sender_name_normalized', { length: 150 }),
    sender_phone: varchar('sender_phone', { length: 20 }),
    balance_after: decimal('balance_after', { precision: 12, scale: 2 }),
    raw_text: text('raw_text').notNull(),
    source: mysqlEnum('source', WALLET_TRANSACTION_SOURCE_VALUES).notNull(),
    status: mysqlEnum('status', WALLET_TRANSACTION_STATUS_VALUES)
      .notNull()
      .default(WalletTransactionStatus.UNMATCHED),
    matched_order_id: int('matched_order_id'),
    matched_at: timestamp('matched_at'),
    received_at: timestamp('received_at').notNull(),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    // Named explicitly: MySQL limits identifier names to 64 characters
    foreignKey({
      name: 'WalletTransaction_matched_order_fk',
      columns: [table.matched_order_id],
      foreignColumns: [esimPurchases.esim_purchase_id],
    }).onDelete('set null'),
  ],
);
/**
 * Ledger of every change to a customer's prepaid balance. Users.balance is
 * the running total; each row records the balance after the change.
 */
export const balanceTransactions = mysqlTable(
  'BalanceTransaction',
  {
    balance_transaction_id: int('balance_transaction_id')
      .primaryKey()
      .autoincrement(),
    customer_id: int('customer_id').notNull(),
    amount: int('amount').notNull(), // signed: +credit, -debit
    balance_after: int('balance_after').notNull(),
    kind: mysqlEnum('kind', BALANCE_TRANSACTION_KIND_VALUES).notNull(),
    order_id: int('order_id'),
    wallet_transaction_id: int('wallet_transaction_id'),
    note: varchar('note', { length: 255 }),
    created_at: timestamp('created_at').defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'BalanceTransaction_customer_fk',
      columns: [table.customer_id],
      foreignColumns: [users.user_id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'BalanceTransaction_order_fk',
      columns: [table.order_id],
      foreignColumns: [esimPurchases.esim_purchase_id],
    }).onDelete('set null'),
    foreignKey({
      name: 'BalanceTransaction_wallet_fk',
      columns: [table.wallet_transaction_id],
      foreignColumns: [walletTransactions.wallet_transaction_id],
    }).onDelete('set null'),
  ],
);

/**
 * A customer's statement "I paid order X from wallet Y / with reference Z".
 * A claim is matched automatically against WalletTransaction rows, either
 * immediately when submitted or later when the matching notification arrives.
 */
export const paymentClaims = mysqlTable(
  'PaymentClaim',
  {
    claim_id: int('claim_id').primaryKey().autoincrement(),
    purpose: mysqlEnum('purpose', PAYMENT_CLAIM_PURPOSE_VALUES)
      .notNull()
      .default(PaymentClaimPurpose.ORDER),
    // Set for order claims; NULL for balance top-ups
    order_id: int('order_id')
      .unique()
      .references(() => esimPurchases.esim_purchase_id, {
        onDelete: 'cascade',
      }),
    // Requested top-up amount in whole currency units
    topup_amount: int('topup_amount'),
    customer_id: int('customer_id')
      .notNull()
      .references(() => users.user_id, { onDelete: 'cascade' }),
    sender_name: varchar('sender_name', { length: 150 }),
    sender_name_normalized: varchar('sender_name_normalized', { length: 150 }),
    sender_phone: varchar('sender_phone', { length: 20 }),
    reference: varchar('reference', { length: 100 }),
    status: mysqlEnum('status', PAYMENT_CLAIM_STATUS_VALUES)
      .notNull()
      .default(PaymentClaimStatus.PENDING),
    attempts: int('attempts').notNull().default(0),
    matched_transaction_id: int('matched_transaction_id'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    foreignKey({
      name: 'PaymentClaim_matched_transaction_fk',
      columns: [table.matched_transaction_id],
      foreignColumns: [walletTransactions.wallet_transaction_id],
    }).onDelete('set null'),
  ],
);
export const usersRelations = relations(users, ({ many }) => ({
  purchases: many(esimPurchases),
  favoritePlans: many(customerFavoritePlans),
  actions: many(adminActions),
}));
export const providersRelations = relations(providers, ({ many }) => ({
  plans: many(plans),
  esims: many(esims),
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
  provider: one(providers, {
    fields: [esims.provider_id],
    references: [providers.provider_id],
  }),
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
  plan: one(plans, {
    fields: [esimPurchases.plan_id],
    references: [plans.plan_id],
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

export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    matchedOrder: one(esimPurchases, {
      fields: [walletTransactions.matched_order_id],
      references: [esimPurchases.esim_purchase_id],
    }),
  }),
);
export const paymentClaimsRelations = relations(paymentClaims, ({ one }) => ({
  order: one(esimPurchases, {
    fields: [paymentClaims.order_id],
    references: [esimPurchases.esim_purchase_id],
  }),
  customer: one(users, {
    fields: [paymentClaims.customer_id],
    references: [users.user_id],
  }),
  matchedTransaction: one(walletTransactions, {
    fields: [paymentClaims.matched_transaction_id],
    references: [walletTransactions.wallet_transaction_id],
  }),
}));
export const balanceTransactionsRelations = relations(
  balanceTransactions,
  ({ one }) => ({
    customer: one(users, {
      fields: [balanceTransactions.customer_id],
      references: [users.user_id],
    }),
  }),
);

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.user_id],
    references: [users.user_id],
  }),
}));
