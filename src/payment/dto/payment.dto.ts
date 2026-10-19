import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  Max,
  NotEquals,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BalanceTransactionKind,
  PaymentClaimPurpose,
  PaymentClaimStatus,
  WalletTransactionSource,
  WalletTransactionStatus,
} from '../../enums/myenums';
import type { OrderWithDetailsResponseDto } from '../../order/dto/order.dto';

/** Body of the customer's "I have paid" request. */
export class SubmitPaymentClaimDto {
  @ApiProperty({ description: 'Order ID that was paid', example: 12 })
  @IsInt()
  @Min(1)
  order_id: number;

  @ApiPropertyOptional({
    description:
      'Full name of the Jawwal Pay wallet owner who sent the money (as it appears in the wallet)',
    example: 'المعتز بالله عاطف ابو خاطر',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  sender_name?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the wallet that sent the money',
    example: '0599123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sender_phone?: string;

  @ApiPropertyOptional({
    description: 'Transfer reference number from the Jawwal Pay receipt',
    example: '2922922584908',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

/** Body of POST /payments/topups: add prepaid balance by transfer. */
export class SubmitTopupDto {
  @ApiProperty({
    description: 'Amount to add to the prepaid balance, in whole ILS',
    example: 50,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Max(100000)
  amount: number;

  @ApiPropertyOptional({
    description: 'Full name of the Jawwal Pay wallet owner who sends the money',
    example: 'المعتز بالله عاطف ابو خاطر',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  sender_name?: string;

  @ApiPropertyOptional({ description: 'Phone of the sending wallet' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sender_phone?: string;

  @ApiPropertyOptional({ description: 'Transfer reference number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

/** Body of POST /payments/balances/:customerId/adjust (Admin). */
export class AdjustBalanceDto {
  @ApiProperty({
    description:
      'Signed amount in whole ILS: positive credits, negative debits',
    example: 100,
  })
  @IsInt()
  @NotEquals(0)
  amount: number;

  @ApiProperty({
    description: 'Reason, e.g. cash top-up received in the shop',
    example: 'Cash top-up at the office',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  note: string;
}

/** Body of POST /payments/notifications and POST /payments/transactions. */
export class IngestNotificationDto {
  @ApiProperty({
    description: 'Raw text (or HTML) of the Jawwal Pay notification',
    example:
      'لقد استلمت حركه تحويل اموال بقيمة: ILS 1.00 من المعتز بالله عاطف ابو خاطر . الرصيد الحالي: ILS 424.00 .المرجع :(2922922584908)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;

  @ApiPropertyOptional({
    description: 'When the notification was received (defaults to now)',
    example: '2025-10-25T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  received_at?: string;
}

export class MatchTransactionDto {
  @ApiProperty({ description: 'Order ID to attach the transaction to' })
  @IsInt()
  @Min(1)
  order_id: number;
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(WalletTransactionStatus) })
  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;
}

export class ListClaimsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(PaymentClaimStatus) })
  @IsOptional()
  @IsEnum(PaymentClaimStatus)
  status?: PaymentClaimStatus;
}

// --- Responses ---
export class WalletTransactionResponseDto {
  wallet_transaction_id: number;
  provider: string;
  reference: string;
  amount: string;
  currency: string;
  sender_name?: string;
  sender_phone?: string;
  balance_after?: string;
  source: WalletTransactionSource;
  status: WalletTransactionStatus;
  matched_order_id?: number;
  matched_at?: Date;
  received_at: Date;
  created_at: Date;
}

export class PaymentClaimResponseDto {
  claim_id: number;
  purpose: PaymentClaimPurpose;
  order_id?: number;
  topup_amount?: number;
  customer_id: number;
  sender_name?: string;
  sender_phone?: string;
  reference?: string;
  status: PaymentClaimStatus;
  attempts: number;
  matched_transaction_id?: number;
  created_at: Date;
  updated_at: Date;
}

export type ClaimResultStatus =
  | 'matched' // payment found, order completed, eSIM sent
  | 'already_paid' // order was already completed
  | 'pending' // no matching transfer yet; will be matched automatically
  | 'ambiguous'; // several transfers match; reference number required

export class ClaimResultDto {
  @ApiProperty({
    enum: ['matched', 'already_paid', 'pending', 'ambiguous'],
  })
  status: ClaimResultStatus;
  message: string;
  claim: PaymentClaimResponseDto;
  /** Order claims: payment and purchase status of the order. */
  order_payment_status?: string;
  order_purchase_status?: string;
  /** Order claims, once matched: the eSIM with its QR code. */
  esim?: OrderWithDetailsResponseDto['esim'];
  /** Top-up claims, once matched: the new prepaid balance. */
  balance?: number;
}

export class BalanceTransactionResponseDto {
  balance_transaction_id: number;
  amount: number;
  balance_after: number;
  kind: BalanceTransactionKind;
  order_id?: number;
  note?: string;
  created_at: Date;
}

export class BalanceResponseDto {
  customer_id: number;
  balance: number;
  currency: string;
  transactions: BalanceTransactionResponseDto[];
}

export class PayWithBalanceResultDto {
  order: OrderWithDetailsResponseDto;
  balance: number;
}

export class IngestResultDto {
  @ApiProperty({ enum: ['created', 'duplicate', 'ignored'] })
  status: 'created' | 'duplicate' | 'ignored';
  transaction?: WalletTransactionResponseDto;
  matched_order_id?: number;
}

export class PaymentInstructionsDto {
  method: string;
  currency: string;
  wallet_number: string;
  wallet_name: string;
  steps: string[];
}
