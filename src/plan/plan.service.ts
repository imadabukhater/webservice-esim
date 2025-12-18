import { Injectable, BadRequestException } from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { plans, providers, esimPurchases, esims } from '../drizzle/schema';
import { eq, asc, and } from 'drizzle-orm';
import {
  CreatePlanRequestDto,
  UpdatePlanRequestDto,
  PlanResponseDto,
  PlanWithProviderResponseDto,
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
  async findAll(is_active?: boolean): Promise<PlanWithProviderResponseDto[]> {
    const plansList = await this.db.query.plans.findMany({
      where:
        is_active !== undefined ? eq(plans.is_active, is_active) : undefined,
      orderBy: [asc(plans.price)],
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
    return mapToPlanWithProviderResponse(foundPlan);
  }
  async create(
    createPlanDto: CreatePlanRequestDto,
    adminId: number,
  ): Promise<PlanResponseDto> {
    const [newPlan] = await this.db.insert(plans).values({
      provider_id: createPlanDto.provider_id,
      plan_name: createPlanDto.plan_name,
      data_amount_gb: createPlanDto.data_amount_gb,
      call_minutes: createPlanDto.call_minutes,
      sms_count: createPlanDto.sms_count,
      validity_days: createPlanDto.validity_days,
      price: createPlanDto.price.toString(),
      description: createPlanDto.description,
      is_active: createPlanDto.is_active ?? true,
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
    await this.validatePlanExists(id);
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
          plan_name: updatePlanDto.plan_name,
          data_amount_gb: updatePlanDto.data_amount_gb,
          call_minutes: updatePlanDto.call_minutes,
          sms_count: updatePlanDto.sms_count,
          validity_days: updatePlanDto.validity_days,
          price: updatePlanDto.price?.toString(),
          description: updatePlanDto.description,
          is_active: updatePlanDto.is_active,
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
    const relatedEsims = await this.db.query.esims.findMany({
      where: eq(esims.plan_id, id),
    });
    if (relatedEsims.length > 0) {
      const assignedCount = relatedEsims.filter(
        (esim) => esim.status === EsimStatus.ASSIGNED,
      ).length;
      const availableCount = relatedEsims.length - assignedCount;
      throw new BadRequestException(
        `Cannot delete plan ${id} because it still has ${relatedEsims.length} eSIM(s) (assigned: ${assignedCount}, available: ${availableCount}).`,
      );
    }
    await this.db.delete(plans).where(eq(plans.plan_id, id));
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PLAN,
      type: AdminActionType.DELETE,
      entityId: id,
      notes: `Deleted plan ${id}`,
    });
  }
  private async validatePlanExists(id: number) {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, id),
    });
    return ensureFound(plan, `Plan with ID ${id} not found`);
  }
}