import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsUrl,
} from 'class-validator';
export class CreateProviderDto {
  @ApiProperty({ description: 'Provider name', example: 'Airalo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
  @ApiPropertyOptional({
    description: 'Provider logo URL',
    example: 'https://example.com/logo.png',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  logo_url?: string;
  @ApiPropertyOptional({
    description: 'Provider description',
    example: 'Global eSIM provider',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional({ description: 'Provider active status', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
export class UpdateProviderDto {
  @ApiPropertyOptional({ description: 'Provider name', example: 'Airalo Pro' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({
    description: 'Provider logo URL',
    example: 'https://example.com/new-logo.png',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  logo_url?: string;
  @ApiPropertyOptional({
    description: 'Provider description',
    example: 'Updated description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional({ description: 'Provider active status', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
// Response DTOs
export class ProviderResponseDto {
  @ApiProperty({ description: 'Provider ID', example: 1 })
  provider_id: number;
  @ApiProperty({ description: 'Provider name', example: 'Airalo' })
  name: string;
  @ApiPropertyOptional({
    description: 'Provider logo URL',
    example: 'https://example.com/logo.png',
  })
  logo_url?: string;
  @ApiPropertyOptional({
    description: 'Provider description',
    example: 'Global eSIM provider',
  })
  description?: string;
  @ApiProperty({ description: 'Provider active status', example: true })
  is_active: boolean;
}
export class ProviderWithPlansResponseDto extends ProviderResponseDto {
  @ApiProperty({ description: 'Provider plans' })
  plans: Array<{
    plan_id: number;
    plan_name: string;
    data_amount_gb: number;
    price: string;
    is_active: boolean;
  }>;
  @ApiProperty({ description: 'Total number of plans', example: 5 })
  total_plans: number;
}