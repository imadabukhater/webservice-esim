import { Injectable } from '@nestjs/common';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common/exceptions';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { UpdateUserProfileDto } from './dto/user.dto';
import { eq } from 'drizzle-orm';
import { ChangePasswordDto, UserResponseDto } from './dto/user.dto';
import * as argon2 from 'argon2';
import { users } from '../drizzle/schema';
import { pickDefined } from '../common/utils/object.utils';
import { ensureFound } from '../common/utils/service.helpers';
import { mapToUserResponse } from '../common/mappers';
@Injectable()
export class UserService {
  constructor(@InjectDrizzle() private readonly db: DatabaseProvider) {}
  async getAllUsers(): Promise<UserResponseDto[]> {
    const users = await this.db.query.users.findMany();
    return users.map(mapToUserResponse);
  }
  async getUserById(id: number): Promise<UserResponseDto> {
    const user = await this.validateUserExists(id);
    return mapToUserResponse(user);
  }
  async updateUserProfile(
    id: number,
    updateUserProfileDto: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    await this.validateUserExists(id);
    await this.db
      .update(users)
      .set(
        pickDefined({
          email: updateUserProfileDto.email,
          full_name: updateUserProfileDto.full_name,
          phone_number: updateUserProfileDto.phone_number,
        }),
      )
      .where(eq(users.user_id, id));
    return this.getUserById(id);
  }
  async changePassword(
    id: number,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.validateUserExists(id);
    const isOldPasswordValid = await argon2.verify(
      user.password_hash,
      changePasswordDto.old_password,
    );
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }
    const newPasswordHash = await argon2.hash(changePasswordDto.new_password, {
      type: argon2.argon2id,
      hashLength: 32,
      timeCost: 2,
      memoryCost: 2 ** 16,
    });
    await this.db
      .update(users)
      .set({ password_hash: newPasswordHash })
      .where(eq(users.user_id, id));
    return { message: 'Password changed successfully' };
  }
  async activateUser(id: number): Promise<UserResponseDto> {
    return this.setActiveState(id, true, 'User is already active');
  }
  async deactivateUser(id: number): Promise<UserResponseDto> {
    return this.setActiveState(id, false, 'User is already inactive');
  }
  private async validateUserExists(id: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.user_id, id),
    });
    return ensureFound(user, `User with ID ${id} not found`);
  }
  private async setActiveState(
    id: number,
    shouldBeActive: boolean,
    alreadyMessage: string,
  ): Promise<UserResponseDto> {
    const user = await this.validateUserExists(id);
    const isActive = user.is_active ?? true;
    if (isActive === shouldBeActive) {
      throw new BadRequestException(alreadyMessage);
    }
    await this.db
      .update(users)
      .set({ is_active: shouldBeActive })
      .where(eq(users.user_id, id));
    return this.getUserById(id);
  }
}