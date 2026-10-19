import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { providers, plans, esims } from '../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { AdminService } from '../user/admin.service';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
} from '../enums/myenums';
import { pickDefined } from '../common/utils/object.utils';
import { ensureFound } from '../common/utils/service.helpers';
import {
  mapToProviderResponse,
  mapToProviderWithPlans,
  mapToEsimWithPlan,
} from '../common/mappers';
@Injectable()
export class ProviderService {
  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly adminService: AdminService,
  ) {}
  /** Store listing: only providers shown to customers. */
  async getAllProviders() {
    const providersList = await this.db.query.providers.findMany({
      where: eq(providers.is_visible, true),
    });
    return providersList.map(mapToProviderResponse);
  }
  /** Admin listing: every provider, including hidden ones. */
  async getAllProvidersForAdmin() {
    const providersList = await this.db.query.providers.findMany();
    return providersList.map(mapToProviderResponse);
  }
  async getProviderById(id: number) {
    const provider = await this.db.query.providers.findFirst({
      where: and(eq(providers.provider_id, id), eq(providers.is_visible, true)),
    });
    const foundProvider = ensureFound(
      provider,
      `Provider with ID ${id} not found`,
    );
    return mapToProviderResponse(foundProvider);
  }
  async createProvider(createProviderDto: CreateProviderDto, adminId: number) {
    const [newProvider] = await this.db.insert(providers).values({
      name: createProviderDto.name,
      logo_url: createProviderDto.logo_url,
      description: createProviderDto.description,
      is_active: createProviderDto.is_active ?? true,
      is_visible: createProviderDto.is_visible ?? true,
      qr_price: createProviderDto.qr_price ?? 0,
      renewal_price: createProviderDto.renewal_price ?? null,
    });
    const createdProvider = await this.db.query.providers.findFirst({
      where: eq(providers.provider_id, newProvider.insertId),
    });
    const foundCreatedProvider = ensureFound(
      createdProvider,
      'Failed to create provider',
    );
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PROVIDER,
      type: AdminActionType.CREATE,
      entityId: foundCreatedProvider.provider_id,
      notes: `Created provider ${foundCreatedProvider.name ?? foundCreatedProvider.provider_id}`,
    });
    return mapToProviderResponse(foundCreatedProvider);
  }
  async updateProvider(
    id: number,
    updateProviderDto: UpdateProviderDto,
    adminId: number,
  ) {
    await this.validateProviderExists(id);
    await this.db
      .update(providers)
      .set(
        pickDefined({
          name: updateProviderDto.name,
          logo_url: updateProviderDto.logo_url,
          description: updateProviderDto.description,
          is_active: updateProviderDto.is_active,
          is_visible: updateProviderDto.is_visible,
          qr_price: updateProviderDto.qr_price,
          // null clears the provider renewal price (plans use their own)
          renewal_price: updateProviderDto.renewal_price,
        }),
      )
      .where(eq(providers.provider_id, id));
    // If provider is being deactivated, also deactivate all their plans
    if (updateProviderDto.is_active === false) {
      await this.db
        .update(plans)
        .set({ is_active: false })
        .where(eq(plans.provider_id, id));
    }
    const updatedProvider = await this.db.query.providers.findFirst({
      where: eq(providers.provider_id, id),
    });
    const foundUpdatedProvider = ensureFound(
      updatedProvider,
      `Provider with ID ${id} not found after update`,
    );
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PROVIDER,
      type: AdminActionType.UPDATE,
      entityId: id,
      notes: `Updated fields: ${Object.keys(updateProviderDto).join(',')}`,
    });
    return mapToProviderResponse(foundUpdatedProvider);
  }
  async deleteProvider(id: number, adminId: number) {
    await this.validateProviderExists(id);
    const providerPlans = await this.db.query.plans.findMany({
      where: eq(plans.provider_id, id),
    });
    if (providerPlans.length > 0) {
      throw new BadRequestException(
        `Cannot delete provider ${id} because it still owns ${providerPlans.length} plan(s). Delete or reassign the plans first.`,
      );
    }
    const providerAssignedEsims = await this.db.query.esims.findMany({
      where: and(
        eq(esims.provider_id, id),
        eq(esims.status, EsimStatus.ASSIGNED),
      ),
    });
    if (providerAssignedEsims.length > 0) {
      throw new BadRequestException(
        `Cannot delete active provider with ${providerAssignedEsims.length} assigned eSIM(s).
         Please deactivate the provider first, then try again after some time.`,
      );
    }
    await this.db.delete(providers).where(eq(providers.provider_id, id));
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PROVIDER,
      type: AdminActionType.DELETE,
      entityId: id,
      notes: `Deleted provider ${id}`,
    });
  }
  /** Store: a visible provider with its visible plans. */
  async getProviderPlans(id: number) {
    const provider = await this.validateProviderExists(id);
    if (!provider.is_visible) {
      throw new NotFoundException(`Provider with ID ${id} not found`);
    }
    const plansList = await this.db.query.plans.findMany({
      where: and(eq(plans.provider_id, id), eq(plans.is_visible, true)),
    });
    return mapToProviderWithPlans(provider, plansList);
  }
  async getProviderEsims(id: number) {
    await this.validateProviderExists(id);
    const esimsList = await this.db.query.esims.findMany({
      where: eq(esims.provider_id, id),
      with: { plan: true, provider: true },
    });
    return esimsList.map(mapToEsimWithPlan);
  }
  private async validateProviderExists(id: number) {
    const provider = await this.db.query.providers.findFirst({
      where: eq(providers.provider_id, id),
    });
    return ensureFound(provider, `Provider with ID ${id} not found`);
  }
}
