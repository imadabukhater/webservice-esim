import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { AdminActionCategory, AdminActionType } from '../../enums/myenums';
export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'oldPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  old_password: string;
  @ApiProperty({
    description: 'New password (min 8 characters)',
    example: 'newPassword456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
export class CreateAdminActionDto {
  @ApiProperty({ description: 'Admin ID performing the action', example: 1 })
  @IsNumber()
  admin_id: number;
  @ApiProperty({
    description: 'Category of the action',
    enum: Object.values(AdminActionCategory),
    example: AdminActionCategory.ESIM,
  })
  @IsEnum(AdminActionCategory)
  action_category: AdminActionCategory;
  @ApiProperty({
    description: 'Type of action',
    enum: Object.values(AdminActionType),
    example: AdminActionType.CREATE,
  })
  @IsEnum(AdminActionType)
  action_type: AdminActionType;
  @ApiProperty({
    description: 'ID of the entity being acted upon',
    example: 123,
  })
  @IsNumber()
  entity_id: number;
  @ApiPropertyOptional({
    description: 'Additional notes about the action',
    example: 'Created new eSIM for customer',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
export class RegisterUserDto {
  @ApiProperty({
    description: 'User email',
    example: 'customer@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
  @ApiProperty({
    description: 'Password (min 8 characters)',
    example: 'securePassword123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
  @ApiProperty({ description: 'Full name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  full_name: string;
  @ApiPropertyOptional({ description: 'Phone number', example: '+32470987654' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;
}
export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    description: 'User email',
    example: 'newemail@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
  @ApiPropertyOptional({ description: 'Full name', example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  full_name?: string;
  @ApiPropertyOptional({ description: 'Phone number', example: '+32471234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone_number?: string;
  @ApiPropertyOptional({ description: 'Account active status', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
export class AddFavoriteDto {
  @ApiProperty({ description: 'Plan ID to favorite', example: 5 })
  @IsNumber()
  plan_id: number;
}
// Response DTOs
export class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  user_id: number;
  @ApiProperty({ description: 'Email address', example: 'user@example.com' })
  email: string;
  @ApiProperty({ description: 'Full name', example: 'John Doe' })
  full_name: string;
  @ApiPropertyOptional({ description: 'Phone number', example: '+32470123456' })
  phone_number?: string;
  @ApiProperty({
    description: 'User role',
    enum: ['customer', 'admin'],
    example: 'customer',
  })
  role: 'customer' | 'admin';
  @ApiProperty({ description: 'Account active status', example: true })
  is_active: boolean;
  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-10-15T10:00:00Z',
  })
  created_at: Date;
  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-10-15T10:00:00Z',
  })
  updated_at: Date;
  @ApiPropertyOptional({
    description: 'Email verification status',
    example: false,
  })
  is_verified?: boolean;
  @ApiPropertyOptional({
    description: 'Last login timestamp',
    example: '2025-10-15T09:30:00Z',
  })
  last_login?: Date;
}
export class AdminActionResponseDto {
  @ApiProperty({ description: 'Action ID', example: 1 })
  action_id: number;
  @ApiProperty({ description: 'Admin ID who performed the action', example: 1 })
  admin_id: number;
  @ApiProperty({
    description: 'Category of the action',
    enum: Object.values(AdminActionCategory),
    example: AdminActionCategory.ESIM,
  })
  action_category: AdminActionCategory;
  @ApiProperty({
    description: 'Type of action',
    enum: Object.values(AdminActionType),
    example: AdminActionType.CREATE,
  })
  action_type: AdminActionType;
  @ApiProperty({ description: 'ID of the entity acted upon', example: 123 })
  entity_id: number;
  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Created new eSIM',
  })
  notes?: string;
  @ApiProperty({
    description: 'Action timestamp',
    example: '2025-10-15T10:30:00Z',
  })
  performed_at: Date;
}
export class FavoriteResponseDto {
  @ApiProperty({ description: 'Favorite ID', example: 1 })
  favorite_id: number;
  @ApiProperty({ description: 'Customer ID', example: 1 })
  customer_id: number;
  @ApiProperty({ description: 'Plan ID', example: 5 })
  plan_id: number;
  @ApiProperty({
    description: 'When the plan was favorited',
    example: '2025-10-15T11:00:00Z',
  })
  added_at: Date;
}