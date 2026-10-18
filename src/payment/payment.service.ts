import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import {
  esimPurchases,
  paymentClaims,
  walletTransactions,
} from '../drizzle/schema';
import {
  AdminActionCategory,
  AdminActionType,
  PaymentClaimStatus,
  PaymentMethod,
  PaymentStatus,
  WalletProvider,
  WalletTransactionSource,
  WalletTransactionStatus,
} from '../enums/myenums';
import { OrderService } from '../order/order.service';
import { AdminService } from '../user/admin.service';
import type { PaymentConfig } from '../config/configuration';
import type { Session } from '../common/types/auth';
import { Role } from '../auth/role';
import { ensureFound } from '../common/utils/service.helpers';
import { ensureDate } from '../common/utils/mapper.utils';
import {
  namesMatch,
  normalizeName,
  normalizePhone,
  normalizeReference,
  parseJawwalPayNotification,
  phonesMatch,
} from './jawwal-pay.parser';
import {
  ClaimResultDto,
  IngestNotificationDto,
  IngestResultDto,
  PaymentClaimResponseDto,
  PaymentInstructionsDto,
  SubmitPaymentClaimDto,
  WalletTransactionResponseDto,
} from './dto/payment.dto';

type WalletTransactionRow = typeof walletTransactions.$inferSelect;
type PaymentClaimRow = typeof paymentClaims.$inferSelect;
type OrderRow = typeof esimPurchases.$inferSelect;

interface ClaimCriteria {
  reference: string | null;
  senderName: string | null;
  senderPhone: string | null;
}

export interface IngestInput {
  text: string;
  source: WalletTransactionSource;
  receivedAt?: Date;
}

export const mapToWalletTransactionResponse = (
  t: WalletTransactionRow,
): WalletTransactionResponseDto => ({
  wallet_transaction_id: t.wallet_transaction_id,
  provider: t.provider,
  reference: t.reference,
  amount: t.amount,
  currency: t.currency,
  sender_name: t.sender_name ?? undefined,
  sender_phone: t.sender_phone ?? undefined,
  balance_after: t.balance_after ?? undefined,
  source: t.source as WalletTransactionSource,
  status: t.status as WalletTransactionStatus,
  matched_order_id: t.matched_order_id ?? undefined,
  matched_at: t.matched_at ?? undefined,
  received_at: ensureDate(t.received_at),
  created_at: ensureDate(t.created_at),
});

export const mapToPaymentClaimResponse = (
  c: PaymentClaimRow,
): PaymentClaimResponseDto => ({
  claim_id: c.claim_id,
  order_id: c.order_id,
  customer_id: c.customer_id,
  sender_name: c.sender_name ?? undefined,
  sender_phone: c.sender_phone ?? undefined,
  reference: c.reference ?? undefined,
  status: c.status as PaymentClaimStatus,
  attempts: c.attempts,
  matched_transaction_id: c.matched_transaction_id ?? undefined,
  created_at: ensureDate(c.created_at),
  updated_at: ensureDate(c.updated_at),
});

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly config: PaymentConfig;

  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly orderService: OrderService,
    private readonly adminService: AdminService,
    configService: ConfigService,
  ) {
    this.config = configService.get<PaymentConfig>('payment')!;
  }

  // ---------------------------------------------------------------------
  // Customer side
  // ---------------------------------------------------------------------

  getInstructions(): PaymentInstructionsDto {
    return {
      method: PaymentMethod.JAWWAL_PAY,
      currency: this.config.currency,
      wallet_number: this.config.walletNumber,
      wallet_name: this.config.walletName,
      steps: [
        'افتح تطبيق جوال باي وحوّل قيمة الطلب بالضبط إلى رقم المحفظة أعلاه.',
        'بعد التحويل، أدخل اسم صاحب المحفظة التي حوّلت منها (كما هو مسجل في جوال باي) أو رقم المرجع الظاهر في الوصل.',
        'سيتم التحقق من الدفع تلقائيًا وإرسال الخط/الـ eSIM إلى بريدك الإلكتروني فور وصول إشعار التحويل.',
      ],
    };
  }

  /**
   * Customer tells us how they paid. We try to match an already received
   * wallet transfer immediately; otherwise the claim stays pending and is
   * matched automatically as soon as the notification arrives.
   */
  async submitClaim(
    user: Session,
    dto: SubmitPaymentClaimDto,
  ): Promise<ClaimResultDto> {
    const criteria = this.toCriteria(dto);
    if (!criteria.reference && !criteria.senderName && !criteria.senderPhone) {
      throw new BadRequestException(
        'Provide the sender name, the sender phone number or the transfer reference',
      );
    }
    if (dto.reference && !criteria.reference) {
      throw new BadRequestException('Reference must contain digits');
    }
    if (dto.sender_phone && !criteria.senderPhone) {
      throw new BadRequestException('Sender phone number is not valid');
    }
    if (
      criteria.senderName &&
      !criteria.reference &&
      !criteria.senderPhone &&
      criteria.senderName.split(' ').length < 2
    ) {
      throw new BadRequestException(
        'Please enter the full sender name (at least two words) or the reference number',
      );
    }

    const order = await this.getOrderForUser(dto.order_id, user);
    if (order.payment_status !== PaymentStatus.PENDING) {
      const existing = await this.findClaimByOrder(order.esim_purchase_id);
      return this.buildResult(
        order.payment_status === PaymentStatus.COMPLETED
          ? 'already_paid'
          : 'pending',
        order.payment_status === PaymentStatus.COMPLETED
          ? 'This order is already paid.'
          : `Order payment status is ${order.payment_status}; contact support.`,
        existing ?? (await this.upsertClaim(order, criteria)),
        order,
      );
    }

    const claim = await this.upsertClaim(order, criteria);
    if (claim.attempts > this.config.maxClaimAttempts) {
      throw new HttpException(
        'Too many verification attempts for this order. Please contact support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidates = await this.eligibleTransactionsForOrder(order);
    const matches = candidates.filter((t) => this.matches(t, criteria));

    if (matches.length === 1) {
      const completed = await this.completeOrderWithTransaction(
        order,
        matches[0],
        claim,
      );
      if (completed) {
        const [freshClaim, freshOrder] = await Promise.all([
          this.findClaimByOrder(order.esim_purchase_id),
          this.getOrderRow(order.esim_purchase_id),
        ]);
        return this.buildResult(
          'matched',
          'Payment verified. Your eSIM has been activated and sent to your e-mail.',
          freshClaim ?? claim,
          freshOrder ?? order,
        );
      }
    }
    if (matches.length > 1) {
      return this.buildResult(
        'ambiguous',
        'Several transfers match this name. Please enter the reference number from your Jawwal Pay receipt.',
        claim,
        order,
      );
    }
    return this.buildResult(
      'pending',
      'We have not received a matching transfer yet. Your request is saved and the order will be activated automatically once the transfer notification arrives.',
      claim,
      order,
    );
  }

  async getClaimForOrder(
    user: Session,
    orderId: number,
  ): Promise<ClaimResultDto> {
    const order = await this.getOrderForUser(orderId, user);
    const claim = await this.findClaimByOrder(orderId);
    if (!claim) {
      throw new NotFoundException(`No payment claim for order ${orderId}`);
    }
    const status =
      order.payment_status === PaymentStatus.COMPLETED
        ? claim.status === PaymentClaimStatus.MATCHED
          ? 'matched'
          : 'already_paid'
        : 'pending';
    return this.buildResult(
      status,
      status === 'pending'
        ? 'Waiting for the transfer notification.'
        : 'Payment verified.',
      claim,
      order,
    );
  }

  // ---------------------------------------------------------------------
  // Ingestion (mail poller / webhook / admin)
  // ---------------------------------------------------------------------

  /**
   * Parse a raw notification, store it (idempotent on the reference) and
   * try to match it against pending customer claims.
   */
  async ingestNotification(input: IngestInput): Promise<IngestResultDto> {
    const parsed = parseJawwalPayNotification(input.text, this.config.currency);
    if (!parsed) {
      this.logger.debug(
        `Ignored notification from ${input.source}: not an incoming wallet transfer`,
      );
      return { status: 'ignored' };
    }

    const existing = await this.db.query.walletTransactions.findFirst({
      where: eq(walletTransactions.reference, parsed.reference),
    });
    if (existing) {
      return {
        status: 'duplicate',
        transaction: mapToWalletTransactionResponse(existing),
        matched_order_id: existing.matched_order_id ?? undefined,
      };
    }

    let insertId: number;
    try {
      const [result] = await this.db.insert(walletTransactions).values({
        provider: WalletProvider.JAWWAL_PAY,
        reference: parsed.reference,
        amount: parsed.amount,
        currency: parsed.currency,
        sender_name: parsed.senderName,
        sender_name_normalized: parsed.senderName
          ? normalizeName(parsed.senderName)
          : null,
        sender_phone: parsed.senderPhone
          ? normalizePhone(parsed.senderPhone)
          : null,
        balance_after: parsed.balanceAfter,
        raw_text: input.text.slice(0, 10000),
        source: input.source,
        status: WalletTransactionStatus.UNMATCHED,
        received_at: input.receivedAt ?? new Date(),
      });
      insertId = result.insertId;
    } catch (error) {
      // Unique constraint: the same notification arrived twice concurrently
      if (this.isDuplicateKeyError(error)) {
        const dup = await this.db.query.walletTransactions.findFirst({
          where: eq(walletTransactions.reference, parsed.reference),
        });
        return {
          status: 'duplicate',
          transaction: dup ? mapToWalletTransactionResponse(dup) : undefined,
          matched_order_id: dup?.matched_order_id ?? undefined,
        };
      }
      throw error;
    }

    const transaction = ensureFound(
      await this.db.query.walletTransactions.findFirst({
        where: eq(walletTransactions.wallet_transaction_id, insertId),
      }),
      'Failed to store wallet transaction',
    );
    this.logger.log(
      `Stored ${transaction.provider} transfer ${transaction.reference}: ${transaction.amount} ${transaction.currency} from ${transaction.sender_name ?? transaction.sender_phone ?? 'unknown'} (${input.source})`,
    );

    const matchedOrderId =
      await this.matchTransactionToPendingClaims(transaction);
    const fresh = await this.db.query.walletTransactions.findFirst({
      where: eq(walletTransactions.wallet_transaction_id, insertId),
    });
    return {
      status: 'created',
      transaction: mapToWalletTransactionResponse(fresh ?? transaction),
      matched_order_id: matchedOrderId ?? undefined,
    };
  }

  async ingestFromAdmin(
    dto: IngestNotificationDto,
    adminId: number,
  ): Promise<IngestResultDto> {
    const result = await this.ingestNotification({
      text: dto.text,
      source: WalletTransactionSource.MANUAL,
      receivedAt: dto.received_at ? new Date(dto.received_at) : undefined,
    });
    if (result.transaction) {
      await this.adminService.logAction({
        adminId,
        category: AdminActionCategory.PURCHASE,
        type: AdminActionType.CREATE,
        entityId: result.transaction.wallet_transaction_id,
        notes: `Manually registered wallet transfer ${result.transaction.reference} (${result.status})`,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Admin side
  // ---------------------------------------------------------------------

  async listTransactions(
    status?: WalletTransactionStatus,
  ): Promise<WalletTransactionResponseDto[]> {
    const rows = await this.db.query.walletTransactions.findMany({
      ...(status && { where: eq(walletTransactions.status, status) }),
      orderBy: desc(walletTransactions.received_at),
      limit: 500,
    });
    return rows.map(mapToWalletTransactionResponse);
  }

  async listClaims(
    status?: PaymentClaimStatus,
  ): Promise<PaymentClaimResponseDto[]> {
    const rows = await this.db.query.paymentClaims.findMany({
      ...(status && { where: eq(paymentClaims.status, status) }),
      orderBy: desc(paymentClaims.updated_at),
      limit: 500,
    });
    return rows.map(mapToPaymentClaimResponse);
  }

  /** Admin manually attaches a received transfer to an order. */
  async adminMatchTransaction(
    transactionId: number,
    orderId: number,
    adminId: number,
  ): Promise<WalletTransactionResponseDto> {
    const transaction = ensureFound(
      await this.db.query.walletTransactions.findFirst({
        where: eq(walletTransactions.wallet_transaction_id, transactionId),
      }),
      `Wallet transaction ${transactionId} not found`,
    );
    if (transaction.status !== WalletTransactionStatus.UNMATCHED) {
      throw new BadRequestException(
        `Transaction ${transactionId} is already ${transaction.status}`,
      );
    }
    const order = ensureFound(
      await this.getOrderRow(orderId),
      `Order with ID ${orderId} not found`,
    );
    if (order.payment_status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Order ${orderId} payment status is ${order.payment_status}`,
      );
    }
    const claim = await this.findClaimByOrder(orderId);
    const completed = await this.completeOrderWithTransaction(
      order,
      transaction,
      claim ?? null,
    );
    if (!completed) {
      throw new BadRequestException(
        'Could not complete the order with this transaction (see server logs)',
      );
    }
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PURCHASE,
      type: AdminActionType.UPDATE,
      entityId: orderId,
      notes: `Manually matched wallet transfer ${transaction.reference} to order ${orderId}`,
    });
    return mapToWalletTransactionResponse(
      ensureFound(
        await this.db.query.walletTransactions.findFirst({
          where: eq(walletTransactions.wallet_transaction_id, transactionId),
        }),
        `Wallet transaction ${transactionId} not found`,
      ),
    );
  }

  async adminIgnoreTransaction(
    transactionId: number,
    adminId: number,
  ): Promise<WalletTransactionResponseDto> {
    const transaction = ensureFound(
      await this.db.query.walletTransactions.findFirst({
        where: eq(walletTransactions.wallet_transaction_id, transactionId),
      }),
      `Wallet transaction ${transactionId} not found`,
    );
    if (transaction.status === WalletTransactionStatus.MATCHED) {
      throw new BadRequestException('Cannot ignore a matched transaction');
    }
    await this.db
      .update(walletTransactions)
      .set({ status: WalletTransactionStatus.IGNORED })
      .where(eq(walletTransactions.wallet_transaction_id, transactionId));
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PURCHASE,
      type: AdminActionType.UPDATE,
      entityId: transactionId,
      notes: `Ignored wallet transfer ${transaction.reference}`,
    });
    return mapToWalletTransactionResponse({
      ...transaction,
      status: WalletTransactionStatus.IGNORED,
    });
  }

  // ---------------------------------------------------------------------
  // Matching core
  // ---------------------------------------------------------------------

  /** A freshly received transfer: look for a pending claim it settles. */
  private async matchTransactionToPendingClaims(
    transaction: WalletTransactionRow,
  ): Promise<number | null> {
    const pendingClaims = await this.db.query.paymentClaims.findMany({
      where: eq(paymentClaims.status, PaymentClaimStatus.PENDING),
      orderBy: paymentClaims.created_at,
    });
    if (pendingClaims.length === 0) return null;

    const orderIds = pendingClaims.map((c) => c.order_id);
    const orders = await this.db.query.esimPurchases.findMany({
      where: and(
        inArray(esimPurchases.esim_purchase_id, orderIds),
        eq(esimPurchases.payment_status, PaymentStatus.PENDING),
      ),
    });
    const orderById = new Map(orders.map((o) => [o.esim_purchase_id, o]));

    const candidates = pendingClaims.filter((claim) => {
      const order = orderById.get(claim.order_id);
      if (!order) return false;
      if (!this.amountAndCurrencyFit(transaction, order)) return false;
      return this.matches(transaction, {
        reference: claim.reference,
        senderName: claim.sender_name_normalized,
        senderPhone: claim.sender_phone,
      });
    });

    // A reference match is unambiguous; otherwise only act when exactly one
    // claim fits, so two customers with similar names never get mixed up.
    const byReference = candidates.filter(
      (c) =>
        c.reference &&
        normalizeReference(c.reference) === transaction.reference,
    );
    const chosen =
      byReference.length === 1
        ? byReference[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
    if (!chosen) {
      if (candidates.length > 1) {
        this.logger.warn(
          `Transfer ${transaction.reference} matches ${candidates.length} pending claims; waiting for a reference number`,
        );
      }
      return null;
    }
    const order = orderById.get(chosen.order_id)!;
    const completed = await this.completeOrderWithTransaction(
      order,
      transaction,
      chosen,
    );
    return completed ? order.esim_purchase_id : null;
  }

  /**
   * Reserve the transaction for the order (atomically, so two concurrent
   * claims can never consume the same transfer), then run the regular
   * payment-completed flow which assigns the eSIM and e-mails the QR code.
   */
  private async completeOrderWithTransaction(
    order: OrderRow,
    transaction: WalletTransactionRow,
    claim: PaymentClaimRow | null,
  ): Promise<boolean> {
    const [reserve] = await this.db
      .update(walletTransactions)
      .set({
        status: WalletTransactionStatus.MATCHED,
        matched_order_id: order.esim_purchase_id,
        matched_at: new Date(),
      })
      .where(
        and(
          eq(
            walletTransactions.wallet_transaction_id,
            transaction.wallet_transaction_id,
          ),
          eq(walletTransactions.status, WalletTransactionStatus.UNMATCHED),
        ),
      );
    if (reserve.affectedRows !== 1) {
      this.logger.warn(
        `Transfer ${transaction.reference} was taken by another order meanwhile`,
      );
      return false;
    }

    try {
      await this.db
        .update(esimPurchases)
        .set({ payment_method: PaymentMethod.JAWWAL_PAY })
        .where(eq(esimPurchases.esim_purchase_id, order.esim_purchase_id));
      await this.orderService.updatePaymentStatus(order.esim_purchase_id, {
        payment_status: PaymentStatus.COMPLETED,
        transaction_id: `${transaction.provider}:${transaction.reference}`,
        payment_reference: transaction.reference,
      });
    } catch (error) {
      // Roll the reservation back so the transfer can be used again
      await this.db
        .update(walletTransactions)
        .set({
          status: WalletTransactionStatus.UNMATCHED,
          matched_order_id: null,
          matched_at: null,
        })
        .where(
          eq(
            walletTransactions.wallet_transaction_id,
            transaction.wallet_transaction_id,
          ),
        );
      this.logger.error(
        `Failed to complete order ${order.esim_purchase_id} with transfer ${transaction.reference}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    if (claim) {
      await this.db
        .update(paymentClaims)
        .set({
          status: PaymentClaimStatus.MATCHED,
          matched_transaction_id: transaction.wallet_transaction_id,
        })
        .where(eq(paymentClaims.claim_id, claim.claim_id));
    }
    this.logger.log(
      `Order ${order.order_number} paid by ${transaction.provider} transfer ${transaction.reference} (${transaction.amount} ${transaction.currency})`,
    );
    return true;
  }

  private matches(
    transaction: WalletTransactionRow,
    criteria: ClaimCriteria,
  ): boolean {
    if (criteria.reference) {
      return normalizeReference(criteria.reference) === transaction.reference;
    }
    if (criteria.senderPhone && transaction.sender_phone) {
      if (phonesMatch(criteria.senderPhone, transaction.sender_phone)) {
        return true;
      }
    }
    if (criteria.senderName && transaction.sender_name_normalized) {
      return namesMatch(
        criteria.senderName,
        transaction.sender_name_normalized,
      );
    }
    return false;
  }

  private amountAndCurrencyFit(
    transaction: WalletTransactionRow,
    order: OrderRow,
  ): boolean {
    if (
      (order.currency ?? this.config.currency).toUpperCase() !==
      transaction.currency.toUpperCase()
    ) {
      return false;
    }
    const paid = Number(transaction.amount);
    const due = Number(order.amount);
    if (!Number.isFinite(paid) || !Number.isFinite(due)) return false;
    if (Math.abs(paid - due) < 0.005) return true;
    return this.config.allowOverpayment && paid > due;
  }

  private async eligibleTransactionsForOrder(
    order: OrderRow,
  ): Promise<WalletTransactionRow[]> {
    const since = new Date(
      Date.now() - this.config.matchWindowHours * 60 * 60 * 1000,
    );
    const rows = await this.db.query.walletTransactions.findMany({
      where: and(
        eq(walletTransactions.status, WalletTransactionStatus.UNMATCHED),
        gte(walletTransactions.received_at, since),
      ),
    });
    return rows.filter((t) => this.amountAndCurrencyFit(t, order));
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private toCriteria(dto: SubmitPaymentClaimDto): ClaimCriteria {
    return {
      reference: normalizeReference(dto.reference) || null,
      senderName: normalizeName(dto.sender_name) || null,
      senderPhone: normalizePhone(dto.sender_phone) || null,
    };
  }

  private async upsertClaim(
    order: OrderRow,
    criteria: ClaimCriteria,
  ): Promise<PaymentClaimRow> {
    const existing = await this.findClaimByOrder(order.esim_purchase_id);
    if (existing) {
      await this.db
        .update(paymentClaims)
        .set({
          sender_name: criteria.senderName,
          sender_name_normalized: criteria.senderName,
          sender_phone: criteria.senderPhone,
          reference: criteria.reference,
          attempts: existing.attempts + 1,
          status:
            existing.status === PaymentClaimStatus.MATCHED
              ? existing.status
              : PaymentClaimStatus.PENDING,
        })
        .where(eq(paymentClaims.claim_id, existing.claim_id));
    } else {
      await this.db.insert(paymentClaims).values({
        order_id: order.esim_purchase_id,
        customer_id: order.customer_id,
        sender_name: criteria.senderName,
        sender_name_normalized: criteria.senderName,
        sender_phone: criteria.senderPhone,
        reference: criteria.reference,
        status: PaymentClaimStatus.PENDING,
        attempts: 1,
      });
    }
    return ensureFound(
      await this.findClaimByOrder(order.esim_purchase_id),
      'Failed to store payment claim',
    );
  }

  private findClaimByOrder(orderId: number) {
    return this.db.query.paymentClaims.findFirst({
      where: eq(paymentClaims.order_id, orderId),
    });
  }

  private getOrderRow(orderId: number) {
    return this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, orderId),
    });
  }

  private async getOrderForUser(
    orderId: number,
    user: Session,
  ): Promise<OrderRow> {
    const order = await this.getOrderRow(orderId);
    if (
      !order ||
      (user.role !== Role.ADMIN && order.customer_id !== user.userId)
    ) {
      throw new NotFoundException('Order not found or access denied');
    }
    return order;
  }

  private buildResult(
    status: ClaimResultDto['status'],
    message: string,
    claim: PaymentClaimRow,
    order: OrderRow,
  ): ClaimResultDto {
    return {
      status,
      message,
      claim: mapToPaymentClaimResponse(claim),
      order_payment_status: order.payment_status ?? PaymentStatus.PENDING,
      order_purchase_status: order.purchase_status ?? 'pending',
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const code = (error as { code?: string; errno?: number } | null)?.code;
    const errno = (error as { errno?: number } | null)?.errno;
    return code === 'ER_DUP_ENTRY' || errno === 1062;
  }
}
