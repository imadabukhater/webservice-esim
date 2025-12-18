import { Injectable, BadRequestException } from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { esims, plans, esimPurchases } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  CreateEsimDto,
  UpdateEsimDto,
  EsimResponseDto,
  EsimWithPlanResponseDto,
} from './dto/esim.dto';
import { AdminService } from '../user/admin.service';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
} from '../enums/myenums';
import { pickDefined } from '../common/utils/object.utils';
import { ensureFound } from '../common/utils/service.helpers';
import { mapToEsimResponse, mapToEsimWithPlan } from '../common/mappers';
@Injectable()
export class EsimService {
  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly adminService: AdminService,
  ) {}
  async getAllEsims(status?: EsimStatus): Promise<EsimWithPlanResponseDto[]> {
    const esimsList = await this.db.query.esims.findMany({
      ...(status && { where: eq(esims.status, status) }),
      with: { plan: { with: { provider: true } } },
    });
    return esimsList.map(mapToEsimWithPlan);
  }
  async getEsimById(id: number): Promise<EsimWithPlanResponseDto> {
    const esim = await this.db.query.esims.findFirst({
      where: eq(esims.esim_id, id),
      with: { plan: { with: { provider: true } } },
    });
    const foundEsim = ensureFound(esim, `eSIM with ID ${id} not found`);
    return mapToEsimWithPlan(foundEsim);
  }
  async createEsim(
    createEsimDto: CreateEsimDto,
    adminId: number,
  ): Promise<EsimResponseDto> {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, createEsimDto.plan_id),
    });
    const foundPlan = ensureFound(
      plan,
      `Cannot create eSIM because plan ${createEsimDto.plan_id} does not exist`,
    );
    if (foundPlan.is_active === false) {
      throw new BadRequestException(
        `Cannot create eSIM for inactive plan ${createEsimDto.plan_id}`,
      );
    }
    const [newEsim] = await this.db.insert(esims).values({
      plan_id: createEsimDto.plan_id,
      phone_number: createEsimDto.phone_number,
      iccid: createEsimDto.iccid,
      qr_code: createEsimDto.qr_code,
      status: EsimStatus.AVAILABLE,
    });
    const createdEsim = await this.db.query.esims.findFirst({
      where: eq(esims.esim_id, newEsim.insertId),
    });
    const foundCreatedEsim = ensureFound(createdEsim, 'Failed to create eSIM');
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.ESIM,
      type: AdminActionType.CREATE,
      entityId: foundCreatedEsim.esim_id,
      notes: 'Created eSIM for plan ' + foundCreatedEsim.plan_id,
    });
    return mapToEsimResponse(foundCreatedEsim);
  }
  async updateEsim(
    id: number,
    updateEsimDto: UpdateEsimDto,
    adminId: number,
  ): Promise<EsimResponseDto> {
    const esim = await this.validateEsimExists(id);
    if (esim.status === EsimStatus.ASSIGNED) {
      throw new BadRequestException(
        'Cannot modify an eSIM that is already assigned to a customer.',
      );
    }
    await this.db
      .update(esims)
      .set(
        pickDefined({
          iccid: updateEsimDto.iccid,
          qr_code: updateEsimDto.qr_code,
        }),
      )
      .where(eq(esims.esim_id, id));
    const updatedEsim = await this.db.query.esims.findFirst({
      where: eq(esims.esim_id, id),
    });
    const foundUpdatedEsim = ensureFound(
      updatedEsim,
      `eSIM with ID ${id} not found after update`,
    );
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.ESIM,
      type: AdminActionType.UPDATE,
      entityId: id,
      notes: `Updated fields: ${Object.keys(updateEsimDto).join(',')}`,
    });
    return mapToEsimResponse(foundUpdatedEsim);
  }
  async deleteEsim(id: number, adminId: number): Promise<void> {
    const esim = await this.validateEsimExists(id);
    if (esim.status === EsimStatus.ASSIGNED) {
      throw new BadRequestException(
        'Cannot delete an eSIM that is already assigned to a customer.',
      );
    }
    const linkedPurchase = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_id, id),
    });
    if (linkedPurchase) {
      throw new BadRequestException(
        `Cannot delete eSIM ${id} because it is linked to order ${
          linkedPurchase.order_number ?? linkedPurchase.esim_purchase_id
        }`,
      );
    }
    await this.db.delete(esims).where(eq(esims.esim_id, id));
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.ESIM,
      type: AdminActionType.DELETE,
      entityId: id,
      notes: `Deleted eSIM ${id}`,
    });
  }
  async getAssignedEsimsByUserId(
    userId: number,
  ): Promise<EsimWithPlanResponseDto[]> {
    const purchases = await this.db.query.esimPurchases.findMany({
      where: eq(esimPurchases.customer_id, userId),
      with: { esim: { with: { plan: { with: { provider: true } } } } },
    });
    const esimsList = purchases
      .map((p) => p.esim)
      .filter((e): e is NonNullable<typeof e> => e !== null);
    return esimsList.map(mapToEsimWithPlan);
  }
  async getAvailableEsimByPlanId(planId: number) {
    const [esim] = await this.db
      .select()
      .from(esims)
      .where(
        and(eq(esims.plan_id, planId), eq(esims.status, EsimStatus.AVAILABLE)),
      )
      .limit(1);
    return esim || null;
  }
  private async validateEsimExists(id: number) {
    const esim = await this.db.query.esims.findFirst({
      where: eq(esims.esim_id, id),
    });
    return ensureFound(esim, `eSIM with ID ${id} not found`);
  }
}