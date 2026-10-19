import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { plans, providers, esimPurchases, esims } from '../drizzle/schema';
import { eq, asc, and, ne, inArray } from 'drizzle-orm';
import {
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
  PlanResponseDto,
  PlanWithProviderResponseDto,
  ResetPlansDto,
  ResetPlansResultDto,
  SyncPlansDto,
  SyncPlansResultDto,
} from './dto/plan.dto';
import { AdminService } from '../user/admin.service';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
  PurchaseStatus,
} from '../enums/myenums';
import { pickDefined } from '../common/utils/object.utils';
import { ensureFound } from '../common/utils/service.helpers';
import {
  mapToPlanResponse,
  mapToPlanWithProviderResponse,
} from '../common/mappers';
@Injectable()
export class PlanService {
  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly adminService: AdminService,
  ) {}
  /** Store listing: plans shown to customers, of providers shown to customers. */
  async findAll(is_active?: boolean): Promise<PlanWithProviderResponseDto[]> {
    const plansList = await this.db.query.plans.findMany({
      where: and(
        eq(plans.is_visible, true),
        is_active !== undefined ? eq(plans.is_active, is_active) : undefined,
      ),
      orderBy: [asc(plans.price)],
      with: { provider: true },
    });
    return plansList
      .filter((plan) => plan.provider?.is_visible)
      .map(mapToPlanWithProviderResponse);
  }
  /** Admin listing: every plan, hidden and archived ones included. */
  async findAllForAdmin(
    providerId?: number,
  ): Promise<PlanWithProviderResponseDto[]> {
    const plansList = await this.db.query.plans.findMany({
      where:
        providerId !== undefined
          ? eq(plans.provider_id, providerId)
          : undefined,
      orderBy: [asc(plans.provider_id), asc(plans.price)],
      with: { provider: true },
    });
    return plansList.map(mapToPlanWithProviderResponse);
  }
  async findOne(id: number): Promise<PlanWithProviderResponseDto> {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, id),
      with: { provider: true },
    });
    const foundPlan = ensureFound(plan, `Plan with ID ${id} not found`);
    if (!foundPlan.is_visible || !foundPlan.provider?.is_visible) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    return mapToPlanWithProviderResponse(foundPlan);
  }
  async create(
    createPlanDto: CreatePlanRequestDto,
    adminId: number,
  ): Promise<PlanResponseDto> {
    const planName = normalizePlanName(createPlanDto.plan_name);
    ensureFound(
      await this.db.query.providers.findFirst({
        where: eq(providers.provider_id, createPlanDto.provider_id),
      }),
      `Provider with ID ${createPlanDto.provider_id} not found`,
    );
    await this.assertUniqueName(createPlanDto.provider_id, planName);
    const [newPlan] = await this.db.insert(plans).values({
      provider_id: createPlanDto.provider_id,
      plan_name: planName,
      data_amount_gb: createPlanDto.data_amount_gb,
      call_minutes: createPlanDto.call_minutes,
      sms_count: createPlanDto.sms_count,
      validity_days: createPlanDto.validity_days,
      price: createPlanDto.price,
      description: createPlanDto.description,
      is_active: createPlanDto.is_active ?? true,
      renewal_price: createPlanDto.renewal_price ?? null,
      is_visible: createPlanDto.is_visible ?? true,
      show_qr: createPlanDto.show_qr ?? true,
    });
    const createdPlan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, newPlan.insertId),
    });
    const foundCreatedPlan = ensureFound(createdPlan, 'Failed to create plan');
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.CREATE,
      entityId: foundCreatedPlan.plan_id,
      notes: `Created plan ${foundCreatedPlan.plan_name} for provider ${foundCreatedPlan.provider_id}`,
    });
    return mapToPlanResponse(foundCreatedPlan);
  }
  async update(
    id: number,
    updatePlanDto: UpdatePlanRequestDto,
    adminId: number,
  ): Promise<PlanResponseDto> {
    const currentPlan = await this.validatePlanExists(id);
    const planName =
      updatePlanDto.plan_name !== undefined
        ? normalizePlanName(updatePlanDto.plan_name)
        : undefined;
    if (planName !== undefined || updatePlanDto.provider_id !== undefined) {
      await this.assertUniqueName(
        updatePlanDto.provider_id ?? currentPlan.provider_id,
        planName ?? currentPlan.plan_name,
        id,
      );
    }
    if (updatePlanDto.provider_id !== undefined) {
      // Check if plan has existing orders before changing provider
      const existingOrders = await this.db.query.esimPurchases.findFirst({
        where: eq(esimPurchases.plan_id, id),
      });
      if (existingOrders) {
        throw new BadRequestException(
          `Cannot change provider for plan ${id} because it has associated orders.`,
        );
      }
      const provider = await this.db.query.providers.findFirst({
        where: eq(providers.provider_id, updatePlanDto.provider_id),
      });
      const foundProvider = ensureFound(
        provider,
        `Provider with ID ${updatePlanDto.provider_id} not found`,
      );
      if (foundProvider.is_active === false) {
        throw new BadRequestException(
          `Cannot assign plan to inactive provider ${updatePlanDto.provider_id}`,
        );
      }
    }
    // Check for deactivation warnings
    if (updatePlanDto.is_active === false) {
      // Check for pending orders
      const pendingOrders = await this.db.query.esimPurchases.findMany({
        where: and(
          eq(esimPurchases.plan_id, id),
          eq(esimPurchases.purchase_status, PurchaseStatus.PENDING),
        ),
      });
      if (pendingOrders.length > 0) {
        throw new BadRequestException(
          `Cannot deactivate plan ${id} because it has ${pendingOrders.length} pending order(s). Complete or cancel them first.`,
        );
      }
      // Check for assigned eSIMs
      const assignedEsims = await this.db.query.esims.findMany({
        where: and(
          eq(esims.plan_id, id),
          eq(esims.status, EsimStatus.ASSIGNED),
        ),
      });
      if (assignedEsims.length > 0) {
        throw new BadRequestException(
          `Cannot deactivate plan ${id} because it has ${assignedEsims.length} assigned eSIM(s) in use.`,
        );
      }
    }
    await this.db
      .update(plans)
      .set(
        pickDefined({
          provider_id: updatePlanDto.provider_id,
          plan_name: planName,
          data_amount_gb: updatePlanDto.data_amount_gb,
          call_minutes: updatePlanDto.call_minutes,
          sms_count: updatePlanDto.sms_count,
          validity_days: updatePlanDto.validity_days,
          price: updatePlanDto.price,
          description: updatePlanDto.description,
          is_active: updatePlanDto.is_active,
          // null clears the plan renewal price (provider / plan price apply)
          renewal_price: updatePlanDto.renewal_price,
          is_visible: updatePlanDto.is_visible,
          show_qr: updatePlanDto.show_qr,
        }),
      )
      .where(eq(plans.plan_id, id));
    const updatedPlan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, id),
    });
    const foundUpdatedPlan = ensureFound(
      updatedPlan,
      `Plan with ID ${id} not found after update`,
    );
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.UPDATE,
      entityId: id,
      notes: `Updated fields: ${Object.keys(updatePlanDto).join(',')}`,
    });
    return mapToPlanResponse(foundUpdatedPlan);
  }
  async remove(id: number, adminId: number): Promise<void> {
    await this.validatePlanExists(id);
    const orders = await this.db.query.esimPurchases.findMany({
      where: eq(esimPurchases.plan_id, id),
    });
    if (orders.length > 0) {
      throw new BadRequestException(
        `Cannot delete plan with ${orders.length} associated order(s). Delete orders first.`,
      );
    }
    // eSIM inventory belongs to the provider: deleting the plan only unlinks
    // its eSIMs (plan_id becomes NULL), they stay available for other plans.
    await this.db.delete(plans).where(eq(plans.plan_id, id));
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.DELETE,
      entityId: id,
      notes: `Deleted plan ${id}`,
    });
  }
  /**
   * Make a provider's plans match a catalog. Plans are matched by name
   * (case-insensitive, extra spaces ignored), so a package is never
   * duplicated for the same provider. Prices, validity and data come from
   * the catalog; admin settings (renewal price, visibility, QR display) are
   * kept unless the catalog sets them.
   */
  async syncProviderPlans(
    dto: SyncPlansDto,
    adminId: number,
  ): Promise<SyncPlansResultDto> {
    const provider = ensureFound(
      await this.db.query.providers.findFirst({
        where: eq(providers.provider_id, dto.provider_id),
      }),
      `Provider with ID ${dto.provider_id} not found`,
    );

    const items = dto.plans.map((item) => ({
      ...item,
      plan_name: normalizePlanName(item.plan_name),
    }));
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      const key = planKey(item.plan_name);
      if (seen.has(key)) duplicates.add(item.plan_name);
      seen.add(key);
    }
    if (duplicates.size > 0) {
      throw new BadRequestException(
        `Duplicate plan names in the catalog: ${[...duplicates].join(', ')}`,
      );
    }

    const existing = await this.db.query.plans.findMany({
      where: eq(plans.provider_id, provider.provider_id),
    });
    const existingByKey = new Map(
      existing.map((plan) => [planKey(plan.plan_name), plan]),
    );
    const removeMissing = dto.remove_missing ?? true;
    const missing = existing.filter(
      (plan) => !seen.has(planKey(plan.plan_name)),
    );
    const withOrders = await this.plansWithOrders(
      missing.map((plan) => plan.plan_id),
    );
    const result = { created: 0, updated: 0, deleted: 0, archived: 0 };

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        const current = existingByKey.get(planKey(item.plan_name));
        const catalogValues = {
          plan_name: item.plan_name,
          data_amount_gb: item.data_amount_gb,
          call_minutes: item.call_minutes ?? 0,
          sms_count: item.sms_count ?? 0,
          validity_days: item.validity_days,
          price: item.price,
          is_active: true,
        };
        if (current) {
          await tx
            .update(plans)
            .set(
              pickDefined({
                ...catalogValues,
                description: item.description,
                renewal_price: item.renewal_price,
                show_qr: item.show_qr,
                // An archived plan that comes back is shown again
                is_visible:
                  item.is_visible ??
                  (current.is_active === false ? true : current.is_visible),
              }),
            )
            .where(eq(plans.plan_id, current.plan_id));
          result.updated++;
        } else {
          await tx.insert(plans).values({
            provider_id: provider.provider_id,
            ...catalogValues,
            description: item.description ?? null,
            renewal_price: item.renewal_price ?? null,
            is_visible: item.is_visible ?? true,
            show_qr: item.show_qr ?? true,
          });
          result.created++;
        }
      }

      if (removeMissing) {
        for (const plan of missing) {
          if (withOrders.has(plan.plan_id)) {
            await tx
              .update(plans)
              .set({ is_active: false, is_visible: false })
              .where(eq(plans.plan_id, plan.plan_id));
            result.archived++;
          } else {
            await tx.delete(plans).where(eq(plans.plan_id, plan.plan_id));
            result.deleted++;
          }
        }
      }
    });

    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.UPDATE,
      entityId: provider.provider_id,
      notes: `Synced plans of provider ${provider.name}: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted, ${result.archived} archived`,
    });

    const current = await this.db.query.plans.findMany({
      where: eq(plans.provider_id, provider.provider_id),
      orderBy: [asc(plans.price)],
    });
    return {
      provider_id: provider.provider_id,
      ...result,
      plans: current.map(mapToPlanResponse),
    };
  }

  /**
   * Delete all plans (optionally of one provider). Plans that already have
   * orders cannot be deleted without losing order history, so they are
   * archived: inactive and hidden. eSIM inventory is kept (it belongs to the
   * provider). A later sync with the same name brings an archived plan back.
   */
  async resetPlans(
    dto: ResetPlansDto,
    adminId: number,
  ): Promise<ResetPlansResultDto> {
    const targets = await this.db.query.plans.findMany({
      where:
        dto.provider_id !== undefined
          ? eq(plans.provider_id, dto.provider_id)
          : undefined,
    });
    const withOrders = await this.plansWithOrders(
      targets.map((plan) => plan.plan_id),
    );
    const archiveIds = targets
      .filter((plan) => withOrders.has(plan.plan_id))
      .map((plan) => plan.plan_id);
    const deleteIds = targets
      .filter((plan) => !withOrders.has(plan.plan_id))
      .map((plan) => plan.plan_id);

    await this.db.transaction(async (tx) => {
      if (archiveIds.length > 0) {
        await tx
          .update(plans)
          .set({ is_active: false, is_visible: false })
          .where(inArray(plans.plan_id, archiveIds));
      }
      if (deleteIds.length > 0) {
        await tx.delete(plans).where(inArray(plans.plan_id, deleteIds));
      }
    });

    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.DELETE,
      entityId: dto.provider_id ?? 0,
      notes: `Reset plans${dto.provider_id !== undefined ? ` of provider ${dto.provider_id}` : ''}: ${deleteIds.length} deleted, ${archiveIds.length} archived`,
    });
    return { deleted: deleteIds.length, archived: archiveIds.length };
  }

  private async plansWithOrders(planIds: number[]): Promise<Set<number>> {
    if (planIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ plan_id: esimPurchases.plan_id })
      .from(esimPurchases)
      .where(inArray(esimPurchases.plan_id, planIds));
    return new Set(rows.map((row) => row.plan_id));
  }

  /** One plan name per provider (the column collation ignores case). */
  private async assertUniqueName(
    providerId: number,
    planName: string,
    excludePlanId?: number,
  ): Promise<void> {
    const duplicate = await this.db.query.plans.findFirst({
      where: and(
        eq(plans.provider_id, providerId),
        eq(plans.plan_name, planName),
        excludePlanId !== undefined
          ? ne(plans.plan_id, excludePlanId)
          : undefined,
      ),
    });
    if (duplicate) {
      throw new ConflictException(
        `Provider ${providerId} already has a plan named "${planName}" (plan ${duplicate.plan_id})`,
      );
    }
  }

  private async validatePlanExists(id: number) {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, id),
    });
    return ensureFound(plan, `Plan with ID ${id} not found`);
  }
}

/** Trim and collapse whitespace so names compare reliably. */
export const normalizePlanName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

const planKey = (name: string): string =>
  normalizePlanName(name).toLocaleLowerCase();
