import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsUrl,
  IsInt,
  Min,
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
  @ApiPropertyOptional({
    description: 'Show this provider in the customer store',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
  @ApiPropertyOptional({
    description:
      'Price of a new eSIM QR from this provider in whole ILS. Added to every new eSIM purchase.',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  qr_price?: number;
  @ApiPropertyOptional({
    description:
      "Default renewal / extension price for this provider's plans in whole ILS. null = use each plan's own price.",
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewal_price?: number | null;
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
  @ApiPropertyOptional({
    description: 'Show this provider in the customer store',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
  @ApiPropertyOptional({
    description:
      'Price of a new eSIM QR from this provider in whole ILS. Added to every new eSIM purchase.',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  qr_price?: number;
  @ApiPropertyOptional({
    description:
      "Default renewal / extension price for this provider's plans in whole ILS. null = use each plan's own price.",
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  renewal_price?: number | null;
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
  @ApiProperty({ description: 'Shown in the customer store', example: true })
  is_visible: boolean;
  @ApiProperty({ description: 'New eSIM QR price, whole ILS', example: 10 })
  qr_price: number;
  @ApiPropertyOptional({
    description: 'Default renewal / extension price, whole ILS',
    example: 25,
  })
  renewal_price?: number;
}
export class ProviderWithPlansResponseDto extends ProviderResponseDto {
  @ApiProperty({ description: 'Provider plans' })
  plans: Array<{
    plan_id: number;
    plan_name: string;
    data_amount_gb: number;
    price: number;
    is_active: boolean;
    is_visible: boolean;
    show_qr: boolean;
    new_esim_total: number;
    renewal_price: number;
  }>;
  @ApiProperty({ description: 'Total number of plans', example: 5 })
  total_plans: number;
}
