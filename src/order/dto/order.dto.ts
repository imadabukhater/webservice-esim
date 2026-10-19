import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsInt,
  IsEnum,
  IsIn,
  IsOptional,
  IsDateString,
  IsNotEmpty,
  Min,
  MaxLength,
} from 'class-validator';
import {
  PaymentStatus,
  PurchaseStatus,
  PurchaseType,
  EsimStatus,
} from '../../enums/myenums';
export class CreateOrderDto {
  @ApiProperty({ description: 'Plan ID to purchase', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  plan_id: number;
  @ApiPropertyOptional({
    description: 'Desired activation date (defaults to now)',
    example: '2025-10-25T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  activation_date?: string;
}
export class RenewOrderDto {
  @ApiProperty({
    description:
      'renewal: a new validity period starts today. extension: validity is added to the current expiry. Both cost the plan price.',
    enum: [PurchaseType.RENEWAL, PurchaseType.EXTENSION],
    example: PurchaseType.RENEWAL,
  })
  @IsIn([PurchaseType.RENEWAL, PurchaseType.EXTENSION])
  type: PurchaseType.RENEWAL | PurchaseType.EXTENSION;
  @ApiPropertyOptional({
    description:
      "Renew onto another visible plan of the same provider (e.g. after a catalog sync). Defaults to the line's current plan.",
    example: 3,
  })
  @IsOptional()
  @IsInt()
  plan_id?: number;
}

// Internal type used by service (includes customer_id from session)
export type CreateOrderData = CreateOrderDto & { customer_id: number };
export class UpdateOrderDto {
  @ApiPropertyOptional({
    description: 'Order amount in whole ILS (no fils)',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
  @ApiPropertyOptional({ description: 'Currency code', example: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
  @ApiPropertyOptional({
    description: 'Purchase status',
    enum: Object.values(PurchaseStatus),
  })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  purchase_status?: PurchaseStatus;
  @ApiPropertyOptional({
    description: 'Payment status',
    enum: Object.values(PaymentStatus),
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  payment_status?: PaymentStatus;
  @ApiPropertyOptional({ description: 'Payment method', example: 'paypal' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  payment_method?: string;
  @ApiPropertyOptional({
    description: 'Payment reference',
    example: 'PAY-123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_reference?: string;
  @ApiPropertyOptional({
    description: 'Transaction ID',
    example: 'TXN-789012',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_id?: string;
  @ApiPropertyOptional({ description: 'eSIM ID', example: 1 })
  @IsOptional()
  @IsNumber()
  esim_id?: number;
  @ApiPropertyOptional({
    description: 'Sent at timestamp',
    example: '2025-10-20T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  sent_at?: Date;
  @ApiPropertyOptional({
    description: 'Activation date',
    example: '2025-10-25T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  activation_date?: Date;
  @ApiPropertyOptional({ description: 'Expiry date', example: '2025-11-25' })
  @IsOptional()
  @IsDateString()
  expiry_date?: Date;
}
export class UpdatePaymentStatusDto {
  @ApiProperty({
    description: 'Payment status',
    enum: Object.values(PaymentStatus),
    example: PaymentStatus.COMPLETED,
  })
  @IsEnum(PaymentStatus)
  payment_status: PaymentStatus;
  @ApiPropertyOptional({
    description: 'Transaction ID',
    example: 'TXN-789012',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transaction_id?: string;
  @ApiPropertyOptional({
    description: 'Payment reference',
    example: 'PAY-123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_reference?: string;
}
// Note: UpdatePurchaseStatusDto, SendOrderEmailDto, and ActivateOrderDto removed
// Purchase status, email sending, and activation now happen automatically
// when payment status changes to 'completed' and eSIM is assigned.
// Response DTOs
export class OrderResponseDto {
  esim_purchase_id: number;
  customer_id: number;
  plan_id: number;
  esim_id?: number;
  order_number: string;
  amount: number;
  /** Part of amount that is the provider QR price (new eSIM only). */
  qr_fee: number;
  currency: string;
  purchase_type: PurchaseType;
  renews_purchase_id?: number;
  purchase_status: PurchaseStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  payment_reference?: string;
  transaction_id?: string;
  sent_at?: Date;
  activation_date?: Date;
  expiry_date: Date;
  purchase_date: Date;
  created_at: Date;
  updated_at: Date;
}
export class OrderWithDetailsResponseDto extends OrderResponseDto {
  customer: {
    customer_id: number;
    // After schema merge: customer_id directly refs users.user_id
    // User data can be queried separately if needed
  };
  /** Whether the QR code is shown to the customer for this order. */
  qr_visible: boolean;
  plan?: {
    plan_id: number;
    provider_id: number;
    plan_name: string;
    data_amount_gb: number;
    validity_days: number;
    price: number;
  };
  esim?: {
    esim_id: number;
    phone_number: string;
    iccid: string;
    /** Omitted when the plan hides the QR from customers. */
    qr_code?: string;
    status: EsimStatus;
    plan: {
      plan_id: number;
      plan_name: string;
      data_amount_gb: number;
      price: number;
    };
  };
}

export class OrderQrResponseDto {
  order_id: number;
  iccid: string;
  phone_number: string;
  qr_code: string;
  /** PNG data URL of the QR code, ready for an <img> tag. */
  qr_image: string;
}
