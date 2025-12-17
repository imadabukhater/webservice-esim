import { EsimStatus, PaymentStatus, PurchaseStatus } from '../enums/myenums';
import { ensureBoolean, ensureDate } from './utils/mapper.utils';
// Types from entities
import type {
  UserEntity,
  FavoritePlanEntity,
  AdminActionEntity,
  ProviderEntity,
  PlanEntity,
  OrderEntity,
  EsimEntity,
} from './types/entities';
// DTOs
import type {
  UserResponseDto,
  FavoriteResponseDto,
  AdminActionResponseDto,
} from '../user/dto/user.dto';
import type {
  ProviderResponseDto,
  ProviderWithPlansResponseDto,
} from '../provider/dto/provider.dto';
import type {
  PlanResponseDto,
  PlanWithProviderResponseDto,
} from '../plan/dto/plan.dto';
import type {
  OrderResponseDto,
  OrderWithDetailsResponseDto,
} from '../order/dto/order.dto';
import type {
  EsimResponseDto,
  EsimWithPlanResponseDto,
} from '../esim/dto/esim.dto';
// --- User Mappers ---
export const mapToUserResponse = (user: UserEntity): UserResponseDto => ({
  user_id: user.user_id,
  email: user.email,
  full_name: user.full_name,
  phone_number: user.phone_number ?? undefined,
  role: user.role,
  is_active: ensureBoolean(user.is_active),
  created_at: ensureDate(user.created_at),
  updated_at: ensureDate(user.updated_at),
});
export const mapToFavoriteResponse = (
  favorite: FavoritePlanEntity,
): FavoriteResponseDto => ({
  favorite_id: favorite.favorite_id,
  customer_id: favorite.customer_id,
  plan_id: favorite.plan_id,
  added_at: ensureDate(favorite.added_at),
});
export const mapToAdminActionResponse = (
  action: AdminActionEntity,
): AdminActionResponseDto => ({
  action_id: action.action_id,
  admin_id: action.admin_id,
  action_category: action.action_category,
  action_type: action.action_type,
  entity_id: action.entity_id,
  notes: action.notes ?? undefined,
  performed_at: ensureDate(action.performed_at),
});
// --- Provider Mappers ---
export const mapToProviderResponse = (
  provider: ProviderEntity,
): ProviderResponseDto => ({
  provider_id: provider.provider_id,
  name: provider.name,
  logo_url: provider.logo_url ?? undefined,
  description: provider.description ?? undefined,
  is_active: ensureBoolean(provider.is_active),
});
export const mapToProviderWithPlans = (
  provider: ProviderEntity,
  providerPlans: PlanEntity[],
): ProviderWithPlansResponseDto => ({
  ...mapToProviderResponse(provider),
  plans: providerPlans.map((plan) => ({
    plan_id: plan.plan_id,
    plan_name: plan.plan_name,
    data_amount_gb: plan.data_amount_gb,
    price: plan.price,
    is_active: ensureBoolean(plan.is_active),
  })),
  total_plans: providerPlans.length,
});
// --- Plan Mappers ---
export const mapToPlanResponse = (plan: PlanEntity): PlanResponseDto => ({
  plan_id: plan.plan_id,
  provider_id: plan.provider_id,
  plan_name: plan.plan_name,
  data_amount_gb: plan.data_amount_gb,
  call_minutes: plan.call_minutes ?? 0,
  sms_count: plan.sms_count ?? 0,
  validity_days: plan.validity_days,
  price: plan.price,
  description: plan.description ?? undefined,
  is_active: ensureBoolean(plan.is_active),
});
export const mapToPlanWithProviderResponse = (
  plan: PlanEntity & { provider?: ProviderEntity | null },
): PlanWithProviderResponseDto => {
  if (!plan.provider)
    throw new Error(`Provider not found for plan ${plan.plan_id}`);
  return {
    ...mapToPlanResponse(plan),
    provider: mapToProviderResponse(plan.provider),
  };
};
// --- Order Mappers ---
type OrderWithRelations = OrderEntity & {
  esim?: (EsimEntity & { plan: PlanEntity }) | null;
};
export const mapToOrderResponse = (order: OrderEntity): OrderResponseDto => ({
  esim_purchase_id: order.esim_purchase_id,
  customer_id: order.customer_id,
  plan_id: order.plan_id,
  esim_id: order.esim_id ?? undefined,
  order_number: order.order_number,
  amount: order.amount,
  currency: order.currency ?? 'EUR',
  purchase_status: order.purchase_status ?? PurchaseStatus.PENDING,
  payment_status: order.payment_status ?? PaymentStatus.PENDING,
  payment_method: order.payment_method,
  payment_reference: order.payment_reference ?? undefined,
  transaction_id: order.transaction_id ?? undefined,
  sent_at: order.sent_at ?? undefined,
  activation_date: order.activation_date ?? undefined,
  expiry_date: order.expiry_date,
  purchase_date: ensureDate(order.purchase_date),
  created_at: ensureDate(order.created_at),
  updated_at: ensureDate(order.updated_at),
});
export const mapToOrderWithDetails = (
  order: OrderWithRelations,
): OrderWithDetailsResponseDto => ({
  ...mapToOrderResponse(order),
  customer: { customer_id: order.customer_id },
  esim: order.esim
    ? {
        esim_id: order.esim.esim_id,
        phone_number: order.esim.phone_number,
        iccid: order.esim.iccid,
        qr_code: order.esim.qr_code,
        status: order.esim.status ?? EsimStatus.AVAILABLE,
        plan: {
          plan_id: order.esim.plan.plan_id,
          plan_name: order.esim.plan.plan_name,
          data_amount_gb: order.esim.plan.data_amount_gb,
          price: order.esim.plan.price,
        },
      }
    : undefined,
});
// --- Esim Mappers ---
type EsimWithPlanEntity = EsimEntity & {
  plan: PlanEntity & { provider: ProviderEntity };
};
export const mapToEsimResponse = (esim: EsimEntity): EsimResponseDto => ({
  esim_id: esim.esim_id,
  plan_id: esim.plan_id,
  phone_number: esim.phone_number,
  iccid: esim.iccid,
  qr_code: esim.qr_code,
  status: esim.status ?? EsimStatus.AVAILABLE,
  created_at: ensureDate(esim.created_at),
  updated_at: ensureDate(esim.updated_at),
});
export const mapToEsimWithPlan = (
  esim: EsimWithPlanEntity,
): EsimWithPlanResponseDto => ({
  ...mapToEsimResponse(esim),
  plan: {
    plan_id: esim.plan.plan_id,
    plan_name: esim.plan.plan_name,
    data_amount_gb: esim.plan.data_amount_gb,
    call_minutes: esim.plan.call_minutes ?? 0,
    sms_count: esim.plan.sms_count ?? 0,
    validity_days: esim.plan.validity_days,
    price: esim.plan.price,
    provider: {
      provider_id: esim.plan.provider.provider_id,
      name: esim.plan.provider.name ?? undefined,
      logo_url: esim.plan.provider.logo_url ?? undefined,
    },
  },
});
