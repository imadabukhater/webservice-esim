import {
  users,
  adminActions,
  providers,
  plans,
  customerFavoritePlans,
  esims,
  esimPurchases,
} from '../../drizzle/schema';
export type UserEntity = typeof users.$inferSelect;
export type AdminActionEntity = typeof adminActions.$inferSelect;
export type ProviderEntity = typeof providers.$inferSelect;
export type PlanEntity = typeof plans.$inferSelect;
export type FavoritePlanEntity = typeof customerFavoritePlans.$inferSelect;
export type EsimEntity = typeof esims.$inferSelect;
export type OrderEntity = typeof esimPurchases.$inferSelect;