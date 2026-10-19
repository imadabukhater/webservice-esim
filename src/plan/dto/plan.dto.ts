import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProviderResponseDto } from '../../provider/dto/provider.dto';
export class CreatePlanRequestDto {
  @ApiProperty({ description: 'Provider ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  provider_id: number;
  @ApiProperty({ description: 'Plan name', example: 'Europe Basic 5GB' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  plan_name: string;
  @ApiProperty({ description: 'Data amount in GB', example: 5, minimum: 1 })
  @IsNumber()
  @Min(1)
  data_amount_gb: number;
  @ApiProperty({
    description: 'Call minutes included',
    example: 100,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  call_minutes: number;
  @ApiProperty({ description: 'SMS count included', example: 50, minimum: 0 })
  @IsNumber()
  @Min(0)
  sms_count: number;
  @ApiProperty({ description: 'Validity in days', example: 30, minimum: 1 })
  @IsNumber()
  @Min(1)
  @Max(365)
  validity_days: number;
  @ApiProperty({
    description: 'Price in whole ILS (no fils), e.g. 20',
    example: 20,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  price: number;
  @ApiPropertyOptional({
    description: 'Plan description',
    example: 'Perfect for short trips across Europe',
  })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ description: 'Plan active status', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
  @ApiPropertyOptional({
    description:
      'Renewal / extension price in whole ILS. null = provider renewal price, then plan price.',
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewal_price?: number | null;
  @ApiPropertyOptional({
    description: 'Show this plan to customers in the store',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
  @ApiPropertyOptional({
    description:
      'Show the QR code to the customer right after payment (direct activation). When false the QR is only visible to admins.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  show_qr?: boolean;
}
export class UpdatePlanRequestDto {
  @ApiPropertyOptional({ description: 'Provider ID', example: 1 })
  @IsOptional()
  @IsNumber()
  provider_id?: number;
  @ApiPropertyOptional({
    description: 'Plan name',
    example: 'Europe Premium 10GB',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  plan_name?: string;
  @ApiPropertyOptional({
    description: 'Data amount in GB',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  data_amount_gb?: number;
  @ApiPropertyOptional({
    description: 'Call minutes included',
    example: 200,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  call_minutes?: number;
  @ApiPropertyOptional({
    description: 'SMS count included',
    example: 100,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sms_count?: number;
  @ApiPropertyOptional({
    description: 'Validity in days',
    example: 30,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  validity_days?: number;
  @ApiPropertyOptional({
    description: 'Price in whole ILS (no fils), e.g. 30',
    example: 30,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;
  @ApiPropertyOptional({
    description: 'Plan description',
    example: 'Extended coverage for longer stays',
  })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ description: 'Plan active status', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
  @ApiPropertyOptional({
    description:
      'Renewal / extension price in whole ILS. null = provider renewal price, then plan price.',
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewal_price?: number | null;
  @ApiPropertyOptional({
    description: 'Show this plan to customers in the store',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
  @ApiPropertyOptional({
    description:
      'Show the QR code to the customer right after payment (direct activation). When false the QR is only visible to admins.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  show_qr?: boolean;
}
// Response DTOs (ONLY PLAN)
export class PlanResponseDto {
  @ApiProperty({ description: 'Plan ID', example: 1 })
  plan_id: number;
  @ApiProperty({ description: 'Provider ID', example: 1 })
  provider_id: number;
  @ApiProperty({ description: 'Plan name', example: 'Europe Basic 5GB' })
  plan_name: string;
  @ApiProperty({ description: 'Data amount in GB', example: 5 })
  data_amount_gb: number;
  @ApiProperty({ description: 'Call minutes included', example: 100 })
  call_minutes: number;
  @ApiProperty({ description: 'SMS count included', example: 50 })
  sms_count: number;
  @ApiProperty({ description: 'Validity in days', example: 30 })
  validity_days: number;
  @ApiProperty({ description: 'Price in whole ILS (no fils)', example: 20 })
  price: number;
  @ApiPropertyOptional({ description: 'Plan description' })
  description?: string;
  @ApiProperty({ description: 'Plan active status', example: true })
  is_active: boolean;
  @ApiPropertyOptional({
    description: 'Renewal price set on the plan itself (raw value)',
    example: 25,
  })
  renewal_price?: number;
  @ApiProperty({ description: 'Shown to customers', example: true })
  is_visible: boolean;
  @ApiProperty({ description: 'QR shown right after payment', example: true })
  show_qr: boolean;
}
export class PlanPricingDto {
  @ApiProperty({ description: 'Plan price', example: 20 })
  plan_price: number;
  @ApiProperty({ description: 'Provider QR price for a new eSIM', example: 10 })
  qr_price: number;
  @ApiProperty({ description: 'Total for a new eSIM (plan + QR)', example: 30 })
  new_esim_total: number;
  @ApiProperty({
    description: 'Effective renewal / extension price',
    example: 20,
  })
  renewal_price: number;
}
export class PlanWithProviderResponseDto extends PlanResponseDto {
  @ApiProperty({ type: ProviderResponseDto })
  provider: ProviderResponseDto;
  @ApiProperty({ type: PlanPricingDto })
  pricing: PlanPricingDto;
}

/** One plan in a provider catalog sync. Matched to existing plans by name. */
export class SyncPlanItemDto {
  @ApiProperty({ example: 'ليان 10GB - 30 يوم' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  plan_name: string;
  @ApiProperty({ example: 10, minimum: 0 })
  @IsInt()
  @Min(0)
  data_amount_gb: number;
  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  call_minutes?: number;
  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sms_count?: number;
  @ApiProperty({ example: 30, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(365)
  validity_days: number;
  @ApiProperty({ description: 'Plan price, whole ILS', example: 40 })
  @IsInt()
  @Min(0)
  price: number;
  @ApiPropertyOptional({
    description:
      'Renewal / extension price in whole ILS. null = provider renewal price, then plan price.',
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewal_price?: number | null;
  @ApiPropertyOptional({
    description: 'Show this plan to customers in the store',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
  @ApiPropertyOptional({
    description:
      'Show the QR code to the customer right after payment (direct activation). When false the QR is only visible to admins.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  show_qr?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SyncPlansDto {
  @ApiProperty({ description: 'Provider whose catalog is synced', example: 1 })
  @IsInt()
  provider_id: number;
  @ApiProperty({ type: [SyncPlanItemDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncPlanItemDto)
  plans: SyncPlanItemDto[];
  @ApiPropertyOptional({
    description:
      "Remove this provider's plans that are not in the list (default true). Plans with orders are archived (hidden and inactive) instead of deleted.",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  remove_missing?: boolean;
}

export class SyncPlansResultDto {
  provider_id: number;
  created: number;
  updated: number;
  deleted: number;
  archived: number;
  @ApiProperty({ type: [PlanResponseDto] })
  plans: PlanResponseDto[];
}

export const RESET_PLANS_CONFIRMATION = 'DELETE ALL PLANS';

export class ResetPlansDto {
  @ApiProperty({
    description: `Must be exactly "${RESET_PLANS_CONFIRMATION}"`,
    example: RESET_PLANS_CONFIRMATION,
  })
  @IsIn([RESET_PLANS_CONFIRMATION])
  confirm: string;
  @ApiPropertyOptional({
    description: 'Only reset the plans of this provider',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  provider_id?: number;
}

export class ResetPlansResultDto {
  deleted: number;
  archived: number;
}
