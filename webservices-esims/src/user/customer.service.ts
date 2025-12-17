import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common/exceptions';
import { FavoriteResponseDto } from './dto/user.dto';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { eq, and } from 'drizzle-orm';
import { customerFavoritePlans } from '../drizzle/schema';
import { DeleteResponseDto } from '../common/dto/common.dto';
import { mapToFavoriteResponse } from '../common/mappers';
@Injectable()
export class CustomerService {
  constructor(@InjectDrizzle() private readonly db: DatabaseProvider) {}
  async addFavorite(
    userId: number,
    planId: number,
  ): Promise<FavoriteResponseDto> {
    const [newFavorite] = await this.db
      .insert(customerFavoritePlans)
      .values({
        customer_id: userId,
        plan_id: planId,
      })
      .$returningId();
    const [favorite] = await this.db
      .select()
      .from(customerFavoritePlans)
      .where(eq(customerFavoritePlans.favorite_id, newFavorite.favorite_id))
      .limit(1);
    if (!favorite) {
      throw new NotFoundException('Failed to retrieve created favorite');
    }
    return mapToFavoriteResponse(favorite);
  }
  async removeFavorite(
    userId: number,
    planId: number,
  ): Promise<DeleteResponseDto> {
    await this.db
      .delete(customerFavoritePlans)
      .where(
        and(
          eq(customerFavoritePlans.customer_id, userId),
          eq(customerFavoritePlans.plan_id, planId),
        ),
      );
    return {
      success: true,
      message: 'Favorite removed successfully',
      deleted_id: planId,
    };
  }
  async getFavoritesByUserId(userId: number): Promise<FavoriteResponseDto[]> {
    const favorites = await this.db
      .select()
      .from(customerFavoritePlans)
      .where(eq(customerFavoritePlans.customer_id, userId));
    return favorites.map(mapToFavoriteResponse);
  }
}