import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { PaymentService } from './payment.service';
import {
  ClaimResultDto,
  IngestNotificationDto,
  IngestResultDto,
  ListClaimsQueryDto,
  ListTransactionsQueryDto,
  MatchTransactionDto,
  PaymentClaimResponseDto,
  PaymentInstructionsDto,
  SubmitPaymentClaimDto,
  WalletTransactionResponseDto,
} from './dto/payment.dto';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/role';
import type { Session } from '../common/types/auth';
import { WalletTransactionSource } from '../enums/myenums';

@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  // ----------------------------- customer ------------------------------

  @Get('instructions')
  @ApiOperation({
    summary: 'How to pay: Jawwal Pay wallet number, currency and steps',
  })
  @ApiResponse({ status: 200, type: PaymentInstructionsDto })
  getInstructions(): PaymentInstructionsDto {
    return this.paymentService.getInstructions();
  }

  @Post('claims')
  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Customer confirms a Jawwal Pay transfer for an order (sender name, phone or reference). ' +
      'If the matching wallet notification was already received the order is completed and the eSIM sent immediately; ' +
      'otherwise the claim is kept and matched automatically when the notification arrives.',
  })
  @ApiResponse({ status: 200, type: ClaimResultDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 429, description: 'Too many attempts' })
  submitClaim(
    @CurrentUser() user: Session,
    @Body() dto: SubmitPaymentClaimDto,
  ): Promise<ClaimResultDto> {
    return this.paymentService.submitClaim(user, dto);
  }

  @Get('claims/order/:orderId')
  @ApiOperation({
    summary: 'Status of the payment claim of an order (customer polls this)',
  })
  @ApiParam({ name: 'orderId', example: 1 })
  @ApiResponse({ status: 200, type: ClaimResultDto })
  getClaim(
    @CurrentUser() user: Session,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<ClaimResultDto> {
    return this.paymentService.getClaimForOrder(user, orderId);
  }

  // ----------------------------- ingestion -----------------------------

  @Post('notifications')
  @Public()
  @HttpCode(200)
  @ApiHeader({
    name: 'x-payment-secret',
    description: 'Shared secret (PAYMENT_WEBHOOK_SECRET)',
  })
  @ApiOperation({
    summary:
      'Webhook: push the raw text of a Jawwal Pay notification (e.g. from a Gmail Apps Script or an SMS forwarder)',
  })
  @ApiResponse({ status: 200, type: IngestResultDto })
  @ApiResponse({ status: 403, description: 'Bad or missing secret' })
  async webhook(
    @Headers('x-payment-secret') secret: string | undefined,
    @Body() dto: IngestNotificationDto,
  ): Promise<IngestResultDto> {
    this.assertWebhookSecret(secret);
    return this.paymentService.ingestNotification({
      text: dto.text,
      source: WalletTransactionSource.WEBHOOK,
      receivedAt: dto.received_at ? new Date(dto.received_at) : undefined,
    });
  }

  // ------------------------------- admin -------------------------------

  @Get('transactions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List received wallet transfers (Admin only)' })
  @ApiResponse({ status: 200, type: [WalletTransactionResponseDto] })
  listTransactions(
    @Query() query: ListTransactionsQueryDto,
  ): Promise<WalletTransactionResponseDto[]> {
    return this.paymentService.listTransactions(query.status);
  }

  @Post('transactions')
  @Roles(Role.ADMIN)
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Register a wallet notification by pasting its text (Admin only, fallback when mail polling is off)',
  })
  @ApiResponse({ status: 201, type: IngestResultDto })
  createTransaction(
    @CurrentUser() user: Session,
    @Body() dto: IngestNotificationDto,
  ): Promise<IngestResultDto> {
    return this.paymentService.ingestFromAdmin(dto, user.userId);
  }

  @Post('transactions/:id/match')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Manually attach a received transfer to an order (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Wallet transaction ID' })
  @ApiResponse({ status: 200, type: WalletTransactionResponseDto })
  matchTransaction(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MatchTransactionDto,
  ): Promise<WalletTransactionResponseDto> {
    return this.paymentService.adminMatchTransaction(
      id,
      dto.order_id,
      user.userId,
    );
  }

  @Post('transactions/:id/ignore')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a transfer as not related to any order (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Wallet transaction ID' })
  @ApiResponse({ status: 200, type: WalletTransactionResponseDto })
  ignoreTransaction(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<WalletTransactionResponseDto> {
    return this.paymentService.adminIgnoreTransaction(id, user.userId);
  }

  @Get('claims')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List customer payment claims (Admin only)' })
  @ApiResponse({ status: 200, type: [PaymentClaimResponseDto] })
  listClaims(
    @Query() query: ListClaimsQueryDto,
  ): Promise<PaymentClaimResponseDto[]> {
    return this.paymentService.listClaims(query.status);
  }

  private assertWebhookSecret(provided: string | undefined): void {
    const expected = this.configService.get<string>(
      'payment.webhookSecret',
      '',
    );
    if (!expected) {
      throw new ServiceUnavailableException(
        'Payment webhook is disabled (PAYMENT_WEBHOOK_SECRET not set)',
      );
    }
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid payment webhook secret');
    }
  }
}
