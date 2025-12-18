import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { EsimStatus } from '../../enums/myenums';
export class CreateEsimDto {
  @ApiProperty({ description: 'Plan ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  plan_id: number;
  @ApiProperty({ description: 'Phone number', example: '+32470123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone_number: string;
  @ApiProperty({
    description: 'ICCID (Integrated Circuit Card Identifier)',
    example: '89310410106543789301',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  iccid: string;
  @ApiProperty({
    description: 'QR code data',
    example: 'LPA:1$smdp.gsma.com$matching_id',
  })
  @IsString()
  @IsNotEmpty()
  qr_code: string;
}
export class UpdateEsimDto {
  @ApiPropertyOptional({
    description: 'ICCID (can be corrected if there was a mistake)',
    example: '89310410106543789302',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  iccid?: string;
  @ApiPropertyOptional({
    description: 'QR code data (can be corrected if there was a mistake)',
    example: 'LPA:1$smdp.gsma.com$matching_id_2',
  })
  @IsOptional()
  @IsString()
  qr_code?: string;
}
// Response DTOs
export class EsimResponseDto {
  esim_id: number;
  plan_id: number;
  phone_number: string;
  iccid: string;
  qr_code: string;
  status: EsimStatus;
  created_at: Date;
  updated_at: Date;
}
export class EsimWithPlanResponseDto extends EsimResponseDto {
  plan: {
    plan_id: number;
    plan_name: string;
    data_amount_gb: number;
    call_minutes: number;
    sms_count: number;
    validity_days: number;
    price: string;
    provider: {
      provider_id: number;
      name: string;
      logo_url?: string;
    };
  };
}