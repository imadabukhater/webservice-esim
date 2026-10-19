import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import {
  balanceTransactions,
  esimPurchases,
  paymentClaims,
  users,
  walletTransactions,
} from '../drizzle/schema';
import {
  AdminActionCategory,
  AdminActionType,
  BalanceTransactionKind,
  PaymentClaimPurpose,
  PaymentClaimStatus,
  PaymentMethod,
  PaymentStatus,
  PurchaseType,
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
  AdjustBalanceDto,
  BalanceResponseDto,
  BalanceTransactionResponseDto,
  ClaimResultDto,
  IngestNotificationDto,
  IngestResultDto,
  PaymentClaimResponseDto,
  PaymentInstructionsDto,
  PayWithBalanceResultDto,
  SubmitPaymentClaimDto,
  SubmitTopupDto,
  WalletTransactionResponseDto,
} from './dto/payment.dto';

type WalletTransactionRow = typeof walletTransactions.$inferSelect;
type PaymentClaimRow = typeof paymentClaims.$inferSelect;
type BalanceTransactionRow = typeof balanceTransactions.$inferSelect;
type OrderRow = typeof esimPurchases.$inferSelect;

interface ClaimCriteria {
  reference: string | null;
  senderName: string | null;
  senderPhone: string | null;
}

/** Something a received transfer can settle: an order or a balance top-up. */
interface PaymentTarget {
  kind: 'order' | 'topup';
  claim: PaymentClaimRow | null;
  order: OrderRow | null;
  customerId: number;
  /** Order: amount due. Top-up: requested amount. Whole currency units. */
  dueAmount: number;
}

type MatchOutcome = 'matched' | 'ambiguous' | 'pending';

export interface IngestInput {
  text: string;
  source: WalletTransactionSource;
  receivedAt?: Date;
}

const MAX_OPEN_TOPUPS = 3;

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
  purpose: c.purpose as PaymentClaimPurpose,
  order_id: c.order_id ?? undefined,
  topup_amount: c.topup_amount ?? undefined,
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

const mapToBalanceTransactionResponse = (
  b: BalanceTransactionRow,
): BalanceTransactionResponseDto => ({
  balance_transaction_id: b.balance_transaction_id,
  amount: b.amount,
  balance_after: b.balance_after,
  kind: b.kind as BalanceTransactionKind,
  order_id: b.order_id ?? undefined,
  note: b.note ?? undefined,
  created_at: ensureDate(b.created_at),
});

/**
 * Pick one item out of candidates. A reference match wins; otherwise the
 * candidates must be unambiguous. Returns 'ambiguous' when several fit.
 */
function selectUnique<T>(
  candidates: T[],
  isReferenceMatch: (item: T) => boolean,
): { item: T } | 'ambiguous' | null {
  const byReference = candidates.filter(isReferenceMatch);
  if (byReference.length === 1) return { item: byReference[0] };
  if (byReference.length > 1) return 'ambiguous';
  if (candidates.length === 1) return { item: candidates[0] };
  if (candidates.length > 1) return 'ambiguous';
  return null;
}

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
  // Customer: instructions, orders, top-ups and balance
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
   * Customer confirms a transfer for an order. If the matching notification
   * already arrived the order is paid now and the eSIM with its QR code is
   * returned; otherwise the claim waits and is matched automatically.
   */
  async submitClaim(
    user: Session,
    dto: SubmitPaymentClaimDto,
  ): Promise<ClaimResultDto> {
    const criteria = this.toCriteria(dto);
    this.validateCriteria(criteria, dto);

    const order = await this.getOrderForUser(dto.order_id, user);

    if (order.payment_status !== PaymentStatus.PENDING) {
      const claim =
        (await this.findOrderClaim(order.esim_purchase_id)) ??
        (await this.upsertOrderClaim(order, criteria));
      return this.resultFor(
        order.payment_status === PaymentStatus.COMPLETED
          ? 'already_paid'
          : 'pending',
        order.payment_status === PaymentStatus.COMPLETED
          ? 'This order is already paid.'
          : `Order payment status is ${order.payment_status}; contact support.`,
        claim.claim_id,
      );
    }

    const claim = await this.upsertOrderClaim(order, criteria);
    if (claim.attempts > this.config.maxClaimAttempts) {
      throw new HttpException(
        'Too many verification attempts for this order. Please contact support.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const outcome = await this.matchClaimNow(this.orderTarget(order, claim));
    return this.resultFor(
      outcome === 'matched'
        ? 'matched'
        : outcome === 'ambiguous'
          ? 'ambiguous'
          : 'pending',
      this.messageFor(outcome),
      claim.claim_id,
    );
  }

  async getClaimForOrder(
    user: Session,
    orderId: number,
  ): Promise<ClaimResultDto> {
    const order = await this.getOrderForUser(orderId, user);
    const claim = await this.findOrderClaim(orderId);
    if (!claim) {
      throw new NotFoundException(`No payment claim for order ${orderId}`);
    }
    const status =
      order.payment_status === PaymentStatus.COMPLETED
        ? claim.status === PaymentClaimStatus.MATCHED
          ? 'matched'
          : 'already_paid'
        : 'pending';
    return this.resultFor(
      status,
      status === 'pending'
        ? 'Waiting for the transfer notification.'
        : 'Payment verified.',
      claim.claim_id,
    );
  }

  /** Customer adds prepaid balance by transfer. Credited when matched. */
  async submitTopup(
    user: Session,
    dto: SubmitTopupDto,
  ): Promise<ClaimResultDto> {
    const criteria = this.toCriteria(dto);
    this.validateCriteria(criteria, dto);

    const open = await this.db.query.paymentClaims.findMany({
      where: and(
        eq(paymentClaims.customer_id, user.userId),
        eq(paymentClaims.purpose, PaymentClaimPurpose.TOPUP),
        eq(paymentClaims.status, PaymentClaimStatus.PENDING),
      ),
    });
    if (open.length >= MAX_OPEN_TOPUPS) {
      throw new BadRequestException(
        `You already have ${MAX_OPEN_TOPUPS} top-ups waiting for a transfer. Please wait or contact support.`,
      );
    }

    const [inserted] = await this.db.insert(paymentClaims).values({
      purpose: PaymentClaimPurpose.TOPUP,
      order_id: null,
      topup_amount: dto.amount,
      customer_id: user.userId,
      sender_name: criteria.senderName,
      sender_name_normalized: criteria.senderName,
      sender_phone: criteria.senderPhone,
      reference: criteria.reference,
      status: PaymentClaimStatus.PENDING,
      attempts: 1,
    });

    const claim = ensureFound(
      await this.findClaimById(inserted.insertId),
      'Failed to store top-up',
    );
    const outcome = await this.matchClaimNow(this.topupTarget(claim));
    return this.resultFor(
      outcome === 'matched'
        ? 'matched'
        : outcome === 'ambiguous'
          ? 'ambiguous'
          : 'pending',
      outcome === 'matched'
        ? 'Top-up received. Your balance has been updated.'
        : this.messageFor(outcome),
      claim.claim_id,
    );
  }

  async getTopups(user: Session): Promise<PaymentClaimResponseDto[]> {
    const rows = await this.db.query.paymentClaims.findMany({
      where: and(
        eq(paymentClaims.customer_id, user.userId),
        eq(paymentClaims.purpose, PaymentClaimPurpose.TOPUP),
      ),
      orderBy: desc(paymentClaims.claim_id),
      limit: 50,
    });
    return rows.map(mapToPaymentClaimResponse);
  }

  async getBalance(customerId: number): Promise<BalanceResponseDto> {
    const customer = ensureFound(
      await this.db.query.users.findFirst({
        where: eq(users.user_id, customerId),
      }),
      `Customer with ID ${customerId} not found`,
    );
    const rows = await this.db.query.balanceTransactions.findMany({
      where: eq(balanceTransactions.customer_id, customerId),
      orderBy: desc(balanceTransactions.balance_transaction_id),
      limit: 50,
    });
    return {
      customer_id: customerId,
      balance: customer.balance,
      currency: this.config.currency,
      transactions: rows.map(mapToBalanceTransactionResponse),
    };
  }

  /** Pay a pending order from the prepaid balance. Gives the eSIM at once. */
  async payWithBalance(
    user: Session,
    orderId: number,
  ): Promise<PayWithBalanceResultDto> {
    const order = await this.getOrderForUser(orderId, user);
    if (order.payment_status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        `Order ${orderId} payment status is ${order.payment_status}`,
      );
    }

    const amount = order.amount;
    const debit = await this.changeBalance(
      order.customer_id,
      -amount,
      BalanceTransactionKind.PURCHASE,
      { orderId, note: `Payment for order ${order.order_number}` },
    );

    try {
      await this.db
        .update(esimPurchases)
        .set({ payment_method: PaymentMethod.BALANCE })
        .where(eq(esimPurchases.esim_purchase_id, orderId));
      await this.orderService.updatePaymentStatus(orderId, {
        payment_status: PaymentStatus.COMPLETED,
        transaction_id: `balance:${debit.ledgerId}`,
        payment_reference: `BAL-${debit.ledgerId}`,
      });
    } catch (error) {
      // Give the money back if the order could not be completed
      await this.changeBalance(
        order.customer_id,
        amount,
        BalanceTransactionKind.REFUND,
        { orderId, note: `Refund: order ${order.order_number} not completed` },
      );
      throw error;
    }

    this.logger.log(
      `Order ${order.order_number} paid from balance (${amount} ${this.config.currency})`,
    );
    return {
      order: await this.orderService.getOrderById(orderId, user),
      balance: debit.balance,
    };
  }

  // ---------------------------------------------------------------------
  // Ingestion (mail poller / webhook / admin)
  // ---------------------------------------------------------------------

  /**
   * Parse a raw notification, store it (idempotent on the reference) and
   * try to settle a pending claim with it.
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

    const matchedOrderId = await this.matchNewTransaction(transaction);
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

  /** Admin attaches a received transfer to an order by hand. */
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

    const claim = await this.findOrderClaim(orderId);
    const settled = await this.settle(
      this.orderTarget(order, claim ?? null),
      transaction,
    );
    if (!settled) {
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

  /** Admin adds or removes balance, e.g. for a cash top-up in the shop. */
  async adjustBalance(
    customerId: number,
    dto: AdjustBalanceDto,
    adminId: number,
  ): Promise<BalanceResponseDto> {
    const customer = ensureFound(
      await this.db.query.users.findFirst({
        where: eq(users.user_id, customerId),
      }),
      `Customer with ID ${customerId} not found`,
    );
    if (customer.role !== Role.CUSTOMER) {
      throw new BadRequestException('Only customers have a balance');
    }

    await this.changeBalance(
      customerId,
      dto.amount,
      BalanceTransactionKind.ADJUSTMENT,
      { note: dto.note.slice(0, 255) },
    );

    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.CUSTOMER,
      type: AdminActionType.UPDATE,
      entityId: customerId,
      notes: `Balance adjustment ${dto.amount}: ${dto.note}`.slice(0, 255),
    });

    return this.getBalance(customerId);
  }

  // ---------------------------------------------------------------------
  // Matching core
  // ---------------------------------------------------------------------

  private orderTarget(
    order: OrderRow,
    claim: PaymentClaimRow | null,
  ): PaymentTarget {
    return {
      kind: 'order',
      claim,
      order,
      customerId: order.customer_id,
      dueAmount: order.amount,
    };
  }

  private topupTarget(claim: PaymentClaimRow): PaymentTarget {
    return {
      kind: 'topup',
      claim,
      order: null,
      customerId: claim.customer_id,
      dueAmount: claim.topup_amount ?? 0,
    };
  }

  /** Try to settle a claim now with a transfer that is already stored. */
  private async matchClaimNow(target: PaymentTarget): Promise<MatchOutcome> {
    const claim = target.claim;
    if (!claim) return 'pending';

    const criteria = this.criteriaOf(claim);
    const transactions = await this.eligibleTransactions();
    const candidates = transactions.filter(
      (tx) => this.fits(tx, target) && this.matches(tx, criteria),
    );
    const selected = selectUnique(
      candidates,
      (tx) => !!criteria.reference && tx.reference === criteria.reference,
    );

    if (selected === 'ambiguous') return 'ambiguous';
    if (selected && (await this.settle(target, selected.item))) {
      return 'matched';
    }
    return 'pending';
  }

  /** A freshly stored transfer: look for the one pending claim it settles. */
  private async matchNewTransaction(
    transaction: WalletTransactionRow,
  ): Promise<number | null> {
    const targets = await this.loadPendingTargets();
    const candidates = targets.filter(
      (t) =>
        this.fits(transaction, t) &&
        this.matches(transaction, this.criteriaOf(t.claim!)),
    );
    const selected = selectUnique(
      candidates,
      (t) =>
        !!t.claim?.reference &&
        normalizeReference(t.claim.reference) === transaction.reference,
    );

    if (selected === 'ambiguous') {
      this.logger.warn(
        `Transfer ${transaction.reference} matches several pending claims; waiting for a reference number`,
      );
      return null;
    }
    if (!selected) return null;
    const settled = await this.settle(selected.item, transaction);
    return settled ? (selected.item.order?.esim_purchase_id ?? null) : null;
  }

  private async loadPendingTargets(): Promise<PaymentTarget[]> {
    const claims = await this.db.query.paymentClaims.findMany({
      where: eq(paymentClaims.status, PaymentClaimStatus.PENDING),
      orderBy: asc(paymentClaims.created_at),
    });
    const orderIds = claims.flatMap((c) => (c.order_id ? [c.order_id] : []));
    const orders =
      orderIds.length === 0
        ? []
        : await this.db.query.esimPurchases.findMany({
            where: and(
              inArray(esimPurchases.esim_purchase_id, orderIds),
              eq(esimPurchases.payment_status, PaymentStatus.PENDING),
            ),
          });
    const orderById = new Map(orders.map((o) => [o.esim_purchase_id, o]));

    return claims.flatMap((claim): PaymentTarget[] => {
      if (claim.purpose === PaymentClaimPurpose.TOPUP) {
        return [this.topupTarget(claim)];
      }
      const order = claim.order_id ? orderById.get(claim.order_id) : undefined;
      return order ? [this.orderTarget(order, claim)] : [];
    });
  }

  /**
   * Settle a target with a transfer. The transfer is reserved atomically
   * first, so two claims can never consume the same transfer.
   */
  private async settle(
    target: PaymentTarget,
    transaction: WalletTransactionRow,
  ): Promise<boolean> {
    const [reserve] = await this.db
      .update(walletTransactions)
      .set({
        status: WalletTransactionStatus.MATCHED,
        matched_order_id: target.order?.esim_purchase_id ?? null,
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
        `Transfer ${transaction.reference} was taken by another claim meanwhile`,
      );
      return false;
    }

    try {
      if (target.kind === 'order' && target.order) {
        await this.payOrder(target.order, transaction);
      } else {
        await this.creditTopup(target, transaction);
      }
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
        `Failed to settle transfer ${transaction.reference}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    if (target.claim) {
      await this.db
        .update(paymentClaims)
        .set({
          status: PaymentClaimStatus.MATCHED,
          matched_transaction_id: transaction.wallet_transaction_id,
        })
        .where(eq(paymentClaims.claim_id, target.claim.claim_id));
    }
    return true;
  }

  /** Complete an order: the regular payment flow assigns the eSIM. */
  private async payOrder(
    order: OrderRow,
    transaction: WalletTransactionRow,
  ): Promise<void> {
    await this.db
      .update(esimPurchases)
      .set({ payment_method: PaymentMethod.JAWWAL_PAY })
      .where(eq(esimPurchases.esim_purchase_id, order.esim_purchase_id));

    await this.orderService.updatePaymentStatus(order.esim_purchase_id, {
      payment_status: PaymentStatus.COMPLETED,
      transaction_id: `${transaction.provider}:${transaction.reference}`,
      payment_reference: transaction.reference,
    });

    this.logger.log(
      `Order ${order.order_number} paid by ${transaction.provider} transfer ${transaction.reference} (${transaction.amount} ${transaction.currency})`,
    );
  }

  private async creditTopup(
    target: PaymentTarget,
    transaction: WalletTransactionRow,
  ): Promise<void> {
    const credited = await this.changeBalance(
      target.customerId,
      target.dueAmount,
      BalanceTransactionKind.TOPUP,
      {
        walletTransactionId: transaction.wallet_transaction_id,
        note: `Top-up via ${transaction.provider} (${transaction.reference})`,
      },
    );
    this.logger.log(
      `Customer ${target.customerId} topped up ${target.dueAmount} ${this.config.currency}; balance ${credited.balance}`,
    );
  }

  /**
   * Change a customer's balance and write the ledger row in one database
   * transaction. Debits are refused when the balance would go negative.
   */
  private async changeBalance(
    customerId: number,
    delta: number,
    kind: BalanceTransactionKind,
    link: {
      orderId?: number;
      walletTransactionId?: number;
      note?: string;
    } = {},
  ): Promise<{ balance: number; ledgerId: number }> {
    return this.db.transaction(async (tx) => {
      const [changed] = await tx
        .update(users)
        .set({ balance: sql`${users.balance} + ${delta}` })
        .where(
          delta < 0
            ? and(eq(users.user_id, customerId), gte(users.balance, -delta))
            : eq(users.user_id, customerId),
        );
      if (changed.affectedRows !== 1) {
        if (delta < 0) {
          throw new BadRequestException(
            'Insufficient balance. Please top up first.',
          );
        }
        throw new NotFoundException(`Customer with ID ${customerId} not found`);
      }

      const [row] = await tx
        .select({ balance: users.balance })
        .from(users)
        .where(eq(users.user_id, customerId));

      const [ledger] = await tx.insert(balanceTransactions).values({
        customer_id: customerId,
        amount: delta,
        balance_after: row.balance,
        kind,
        order_id: link.orderId ?? null,
        wallet_transaction_id: link.walletTransactionId ?? null,
        note: link.note?.slice(0, 255) ?? null,
      });

      return { balance: row.balance, ledgerId: ledger.insertId };
    });
  }

  private fits(
    transaction: WalletTransactionRow,
    target: PaymentTarget,
  ): boolean {
    if (target.kind === 'topup') {
      return (
        Number(transaction.amount) === target.dueAmount &&
        transaction.currency.toUpperCase() ===
          this.config.currency.toUpperCase()
      );
    }
    const order = target.order!;
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

  private criteriaOf(claim: PaymentClaimRow): ClaimCriteria {
    return {
      reference: claim.reference
        ? normalizeReference(claim.reference) || null
        : null,
      senderName: claim.sender_name_normalized,
      senderPhone: claim.sender_phone,
    };
  }

  private async eligibleTransactions(): Promise<WalletTransactionRow[]> {
    const since = new Date(
      Date.now() - this.config.matchWindowHours * 60 * 60 * 1000,
    );
    return this.db.query.walletTransactions.findMany({
      where: and(
        eq(walletTransactions.status, WalletTransactionStatus.UNMATCHED),
        gte(walletTransactions.received_at, since),
      ),
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private toCriteria(dto: {
    sender_name?: string;
    sender_phone?: string;
    reference?: string;
  }): ClaimCriteria {
    return {
      reference: normalizeReference(dto.reference) || null,
      senderName: normalizeName(dto.sender_name) || null,
      senderPhone: normalizePhone(dto.sender_phone) || null,
    };
  }

  private validateCriteria(
    criteria: ClaimCriteria,
    dto: { sender_phone?: string; reference?: string },
  ): void {
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
  }

  private messageFor(outcome: MatchOutcome): string {
    switch (outcome) {
      case 'ambiguous':
        return 'Several transfers match this name. Please enter the reference number from your Jawwal Pay receipt.';
      case 'matched':
        return 'Payment verified.';
      default:
        return 'We have not received a matching transfer yet. Your request is saved and it will be completed automatically once the transfer notification arrives.';
    }
  }

  private async upsertOrderClaim(
    order: OrderRow,
    criteria: ClaimCriteria,
  ): Promise<PaymentClaimRow> {
    const existing = await this.findOrderClaim(order.esim_purchase_id);
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
        purpose: PaymentClaimPurpose.ORDER,
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
      await this.findOrderClaim(order.esim_purchase_id),
      'Failed to store payment claim',
    );
  }

  private findOrderClaim(orderId: number) {
    return this.db.query.paymentClaims.findFirst({
      where: eq(paymentClaims.order_id, orderId),
    });
  }

  private findClaimById(claimId: number) {
    return this.db.query.paymentClaims.findFirst({
      where: eq(paymentClaims.claim_id, claimId),
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

  /**
   * Build the response for a claim. Once an order claim is matched the
   * response carries the eSIM with its QR code; a top-up carries the balance.
   */
  private async resultFor(
    status: ClaimResultDto['status'],
    message: string,
    claimId: number,
  ): Promise<ClaimResultDto> {
    const claim = ensureFound(
      await this.findClaimById(claimId),
      `Payment claim ${claimId} not found`,
    );
    const result: ClaimResultDto = {
      status,
      message,
      claim: mapToPaymentClaimResponse(claim),
    };

    if (claim.purpose === PaymentClaimPurpose.TOPUP) {
      const customer = await this.db.query.users.findFirst({
        where: eq(users.user_id, claim.customer_id),
      });
      result.balance = customer?.balance ?? 0;
      return result;
    }

    if (claim.order_id) {
      const order = ensureFound(
        await this.getOrderRow(claim.order_id),
        `Order with ID ${claim.order_id} not found`,
      );
      result.order_payment_status = order.payment_status ?? 'pending';
      result.order_purchase_status = order.purchase_status ?? 'pending';
      if (status === 'matched' && order.purchase_type === PurchaseType.NEW) {
        result.esim = (
          await this.orderService.getOrderById(order.esim_purchase_id)
        ).esim;
      }
    }
    return result;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    const errno = (error as { errno?: number } | null)?.errno;
    return code === 'ER_DUP_ENTRY' || errno === 1062;
  }
}
