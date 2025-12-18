import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
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
  @ApiProperty({ description: 'Price in EUR', example: 19.99, minimum: 0 })
  @IsNumber()
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
    description: 'Price in EUR',
    example: 29.99,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
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
  @ApiProperty({ description: 'Price in EUR', example: '19.99' })
  price: string;
  @ApiPropertyOptional({ description: 'Plan description' })
  description?: string;
  @ApiProperty({ description: 'Plan active status', example: true })
  is_active: boolean;
}
export class PlanWithProviderResponseDto extends PlanResponseDto {
  @ApiProperty({ type: ProviderResponseDto })
  provider: ProviderResponseDto;
}