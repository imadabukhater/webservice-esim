import { Injectable } from '@nestjs/common';
import { AdminActionResponseDto } from './dto/user.dto';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { eq, and } from 'drizzle-orm';
import { adminActions } from '../drizzle/schema';
import { AdminActionCategory, AdminActionType } from '../enums/myenums';
import { mapToAdminActionResponse } from '../common/mappers';
import { ensureFound } from '../common/utils/service.helpers';
export interface LogAdminActionInput {
  adminId: number;
  category: AdminActionCategory;
  type: AdminActionType;
  entityId: number;
  notes?: string;
}
@Injectable()
export class AdminService {
  constructor(@InjectDrizzle() private readonly db: DatabaseProvider) {}
  async getActions(
    category?: AdminActionCategory,
    adminId?: number,
  ): Promise<AdminActionResponseDto[]> {
    const conditions = [];
    if (category) {
      conditions.push(eq(adminActions.action_category, category));
    }
    if (adminId) {
      conditions.push(eq(adminActions.admin_id, adminId));
    }
    const actions = conditions.length
      ? await this.db.select().from(adminActions).where(and(...conditions))
      : await this.db.select().from(adminActions);
    return actions.map(mapToAdminActionResponse);
  }
  async getActionById(actionId: number): Promise<AdminActionResponseDto> {
    const [action] = await this.db
      .select()
      .from(adminActions)
      .where(eq(adminActions.action_id, actionId))
      .limit(1);
    const foundAction = ensureFound(
      action,
      `Action with ID ${actionId} not found`,
    );
    return mapToAdminActionResponse(foundAction);
  }
  async logAction(input: LogAdminActionInput): Promise<void> {
    await this.db.insert(adminActions).values({
      admin_id: input.adminId,
      action_category: input.category,
      action_type: input.type,
      entity_id: input.entityId,
      notes: input.notes,
    });
  }
}