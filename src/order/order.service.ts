import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { esimPurchases, esims, plans, users } from '../drizzle/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import * as QRCode from 'qrcode';
import {
  CreateOrderData,
  UpdateOrderDto,
  UpdatePaymentStatusDto,
  OrderResponseDto,
  OrderWithDetailsResponseDto,
  OrderQrResponseDto,
} from './dto/order.dto';
import { EsimService } from '../esim/esim.service';
import { AdminService } from '../user/admin.service';
import { EmailService } from '../email/email.service';
import { mapToOrderResponse, mapToOrderWithDetails } from '../common/mappers';
import {
  AdminActionCategory,
  AdminActionType,
  EsimStatus,
  PaymentStatus,
  PurchaseStatus,
  PurchaseType,
} from '../enums/myenums';
import { pickDefined } from '../common/utils/object.utils';
import {
  newEsimTotalOf,
  qrPriceOf,
  renewalPriceOf,
} from '../common/utils/pricing.utils';
import { ensureFound } from '../common/utils/service.helpers';
import {
  fromDateOnly,
  projectExpiry,
  toDateOnly,
} from '../common/utils/date.utils';
import type { Session } from '../common/types/auth';
import { Role } from '../auth/role';

type OrderRow = typeof esimPurchases.$inferSelect;
type PlanRow = typeof plans.$inferSelect;

const ORDER_RELATIONS = { esim: true, plan: true } as const;

/** Admins always see the QR; customers only when the plan shows it. */
const qrOptions = (viewer?: Session) =>
  viewer?.role === Role.ADMIN ? { revealQr: true } : {};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly esimService: EsimService,
    private readonly adminService: AdminService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /** Currency of every order (PAYMENT_CURRENCY, default ILS). */
  private get currency(): string {
    return this.configService.get<string>('payment.currency', 'ILS');
  }

  async getOrders(user: Session): Promise<OrderWithDetailsResponseDto[]> {
    // Admins get all orders, customers get only their own
    if (user.role === Role.ADMIN) {
      return this.getAllOrders(user);
    }
    return this.getOrdersByUserId(user.userId, user);
  }

  async getAllOrders(viewer?: Session): Promise<OrderWithDetailsResponseDto[]> {
    const orders = await this.db.query.esimPurchases.findMany({
      with: ORDER_RELATIONS,
      orderBy: asc(esimPurchases.esim_purchase_id),
    });
    return orders.map((order) =>
      mapToOrderWithDetails(order, qrOptions(viewer)),
    );
  }

  /**
   * Order with details. Without a viewer the customer rule applies: the QR
   * is only included when the plan shows it.
   */
  async getOrderById(
    id: number,
    viewer?: Session,
  ): Promise<OrderWithDetailsResponseDto> {
    const order = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, id),
      with: ORDER_RELATIONS,
    });
    return mapToOrderWithDetails(
      ensureFound(order, `Order with ID ${id} not found`),
      qrOptions(viewer),
    );
  }

  async getOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderWithDetailsResponseDto> {
    const order = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.order_number, orderNumber),
      with: ORDER_RELATIONS,
    });
    return mapToOrderWithDetails(
      ensureFound(order, `Order with number ${orderNumber} not found`),
    );
  }

  async getOrdersByUserId(
    userId: number,
    viewer?: Session,
  ): Promise<OrderWithDetailsResponseDto[]> {
    const orders = await this.db.query.esimPurchases.findMany({
      where: eq(esimPurchases.customer_id, userId),
      with: ORDER_RELATIONS,
      orderBy: asc(esimPurchases.esim_purchase_id),
    });
    return orders.map((order) =>
      mapToOrderWithDetails(order, qrOptions(viewer)),
    );
  }

  /** QR code of a paid order as text and as a PNG data URL. */
  async getOrderQr(
    orderId: number,
    viewer: Session,
  ): Promise<OrderQrResponseDto> {
    const order = ensureFound(
      await this.db.query.esimPurchases.findFirst({
        where: eq(esimPurchases.esim_purchase_id, orderId),
        with: ORDER_RELATIONS,
      }),
      `Order with ID ${orderId} not found`,
    );
    if (viewer.role !== Role.ADMIN && order.customer_id !== viewer.userId) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    if (order.payment_status !== PaymentStatus.COMPLETED || !order.esim) {
      throw new BadRequestException(
        'The QR code is available once the order is paid',
      );
    }
    if (viewer.role !== Role.ADMIN && order.plan?.show_qr === false) {
      throw new BadRequestException(
        'This plan is activated by our team; the QR code is not shown in the store',
      );
    }
    return {
      order_id: order.esim_purchase_id,
      iccid: order.esim.iccid,
      phone_number: order.esim.phone_number,
      qr_code: order.esim.qr_code,
      qr_image: await QRCode.toDataURL(order.esim.qr_code, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      }),
    };
  }

  async createOrder(
    createOrderDto: CreateOrderData,
  ): Promise<OrderResponseDto> {
    // Validate customer exists and is active
    const customer = await this.db.query.users.findFirst({
      where: eq(users.user_id, createOrderDto.customer_id),
    });
    if (!customer) {
      throw new BadRequestException(
        `Customer with ID ${createOrderDto.customer_id} not found`,
      );
    }
    if (!customer.is_active) {
      throw new BadRequestException(`Customer account is not active`);
    }

    // Validate plan exists, is active and shown in the store
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, createOrderDto.plan_id),
      with: { provider: true },
    });
    if (!plan || !plan.is_visible || !plan.provider?.is_visible) {
      throw new BadRequestException(
        `Plan with ID ${createOrderDto.plan_id} not found`,
      );
    }
    if (!plan.is_active || plan.provider.is_active === false) {
      throw new BadRequestException(
        `Plan ${plan.plan_name} is not active and cannot be purchased`,
      );
    }

    // eSIM QR inventory belongs to the provider
    const availableEsim = await this.db.query.esims.findFirst({
      where: and(
        eq(esims.provider_id, plan.provider_id),
        eq(esims.status, EsimStatus.AVAILABLE),
      ),
    });
    if (!availableEsim) {
      throw new BadRequestException(
        `No available eSIMs for ${plan.provider.name}. Please contact support.`,
      );
    }
    const qrFee = qrPriceOf(plan.provider);
    const total = newEsimTotalOf(plan, plan.provider);

    // activation_date defaults to today
    const activationDate = createOrderDto.activation_date
      ? new Date(createOrderDto.activation_date)
      : new Date();

    // expiry_date = activation_date + validity_days
    const expiryDate = new Date(activationDate);
    expiryDate.setDate(expiryDate.getDate() + plan.validity_days);

    const orderNumber = this.generateOrderNumber();

    const [newOrder] = await this.db.insert(esimPurchases).values({
      customer_id: createOrderDto.customer_id,
      plan_id: createOrderDto.plan_id,
      esim_id: null,
      order_number: orderNumber,
      amount: total, // plan price + provider QR price, whole units
      qr_fee: qrFee,
      currency: this.currency,
      purchase_type: PurchaseType.NEW,
      payment_status: PaymentStatus.PENDING,
      purchase_status: PurchaseStatus.PENDING,
      activation_date: activationDate,
      expiry_date: expiryDate,
    });

    const createdOrder = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, newOrder.insertId),
    });
    const foundCreatedOrder = ensureFound(
      createdOrder,
      'Failed to create order',
    );

    // Send order-received email (non-blocking)
    this.emailService
      .sendOrderReceivedEmail({
        email: customer.email,
        fullName: customer.full_name,
        orderNumber,
        planName: plan.plan_name,
        amount: total,
        currency: this.currency,
      })
      .catch(() => {
        // Ignore email send errors; order creation succeeded regardless
      });

    return mapToOrderResponse(foundCreatedOrder);
  }

  /**
   * Renew or extend an existing eSIM line. The price is the plan's renewal
   * price (set on the plan, else on the provider, else the plan price); no
   * QR price since the line is reused. The renewal order is paid like any
   * other order; once payment completes the original line's expiry moves.
   */
  async createRenewalOrder(
    customerId: number,
    purchaseId: number,
    type: PurchaseType.RENEWAL | PurchaseType.EXTENSION,
    planId?: number,
  ): Promise<OrderResponseDto> {
    const original = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, purchaseId),
    });
    if (!original || original.customer_id !== customerId) {
      throw new NotFoundException(`Order with ID ${purchaseId} not found`);
    }
    if (original.purchase_type !== PurchaseType.NEW) {
      throw new BadRequestException(
        'Only an original purchase can be renewed or extended',
      );
    }
    if (!original.esim_id) {
      throw new BadRequestException('This order has no eSIM line assigned yet');
    }

    const line = ensureFound(
      await this.db.query.esims.findFirst({
        where: eq(esims.esim_id, original.esim_id),
      }),
      `eSIM of order ${purchaseId} not found`,
    );
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, planId ?? original.plan_id),
      with: { provider: true },
    });
    if (!plan || !plan.provider) {
      throw new NotFoundException(
        `Plan with ID ${planId ?? original.plan_id} not found`,
      );
    }
    const foundPlan = plan;
    if (foundPlan.provider_id !== line.provider_id) {
      throw new BadRequestException(
        'The plan must belong to the same provider as the eSIM line',
      );
    }
    if (planId !== undefined && !foundPlan.is_visible) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }
    if (!foundPlan.is_active) {
      throw new BadRequestException(
        `Plan ${foundPlan.plan_name} is no longer sold. Choose another plan of ${foundPlan.provider.name} to renew.`,
      );
    }

    const today = toDateOnly(new Date());
    const currentExpiry = toDateOnly(original.expiry_date);
    if (type === PurchaseType.EXTENSION && currentExpiry < today) {
      throw new BadRequestException(
        'This line has already expired. Renew it instead of extending it.',
      );
    }

    const pending = await this.db.query.esimPurchases.findFirst({
      where: and(
        eq(esimPurchases.renews_purchase_id, purchaseId),
        eq(esimPurchases.payment_status, PaymentStatus.PENDING),
      ),
    });
    if (pending) {
      throw new BadRequestException(
        'A renewal or extension for this line is already waiting for payment',
      );
    }

    const orderNumber = this.generateOrderNumber();
    await this.db.insert(esimPurchases).values({
      customer_id: customerId,
      plan_id: foundPlan.plan_id,
      esim_id: null,
      renews_purchase_id: purchaseId,
      purchase_type: type,
      order_number: orderNumber,
      amount: renewalPriceOf(foundPlan, foundPlan.provider),
      qr_fee: 0,
      currency: this.currency,
      payment_status: PaymentStatus.PENDING,
      purchase_status: PurchaseStatus.PENDING,
      // Projected expiry, recalculated when the payment completes
      expiry_date: fromDateOnly(
        projectExpiry(type, currentExpiry, foundPlan.validity_days, today),
      ),
    });

    const created = ensureFound(
      await this.db.query.esimPurchases.findFirst({
        where: eq(esimPurchases.order_number, orderNumber),
      }),
      'Failed to create renewal order',
    );
    return mapToOrderResponse(created);
  }

  /**
   * Customer activates the eSIM of a paid order. Idempotent: activating an
   * already activated line returns it unchanged.
   */
  async activateOrder(
    orderId: number,
    customerId: number,
  ): Promise<OrderWithDetailsResponseDto> {
    const order = await this.validateOrderExists(orderId);
    if (order.customer_id !== customerId) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    if (order.payment_status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('The order is not paid yet');
    }
    if (!order.esim_id) {
      throw new BadRequestException(
        'No eSIM is assigned to this order (renewal orders use the original line)',
      );
    }
    if (order.purchase_status !== PurchaseStatus.ACTIVATED) {
      await this.db
        .update(esimPurchases)
        .set({
          purchase_status: PurchaseStatus.ACTIVATED,
          activation_date: new Date(),
        })
        .where(eq(esimPurchases.esim_purchase_id, orderId));
    }
    return this.getOrderById(orderId);
  }

  async updateOrder(
    id: number,
    updateOrderDto: UpdateOrderDto,
    adminId: number,
  ): Promise<OrderResponseDto> {
    await this.validateOrderExists(id);

    await this.db
      .update(esimPurchases)
      .set(
        pickDefined({
          amount: updateOrderDto.amount,
          currency: updateOrderDto.currency,
          purchase_status: updateOrderDto.purchase_status,
          payment_method: updateOrderDto.payment_method,
          payment_reference: updateOrderDto.payment_reference,
          transaction_id: updateOrderDto.transaction_id,
          esim_id: updateOrderDto.esim_id,
          sent_at: updateOrderDto.sent_at
            ? new Date(updateOrderDto.sent_at)
            : undefined,
          activation_date: updateOrderDto.activation_date
            ? new Date(updateOrderDto.activation_date)
            : undefined,
          expiry_date: updateOrderDto.expiry_date
            ? new Date(updateOrderDto.expiry_date)
            : undefined,
        }),
      )
      .where(eq(esimPurchases.esim_purchase_id, id));

    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PURCHASE,
      type: AdminActionType.UPDATE,
      entityId: id,
      notes: `Updated order fields: ${Object.keys(updateOrderDto).join(',')}`,
    });

    const updatedOrder = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, id),
    });
    return mapToOrderResponse(
      ensureFound(updatedOrder, `Order with ID ${id} not found after update`),
    );
  }

  async updatePaymentStatus(
    id: number,
    paymentDto: UpdatePaymentStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.validateOrderExists(id);

    // Payment State Machine Validation
    const currentStatus = order.payment_status;
    const newStatus = paymentDto.payment_status;

    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
      [PaymentStatus.COMPLETED]: [PaymentStatus.REFUNDED],
      [PaymentStatus.FAILED]: [],
      [PaymentStatus.REFUNDED]: [],
    };

    if (
      currentStatus &&
      !validTransitions[currentStatus]?.includes(newStatus)
    ) {
      throw new BadRequestException(
        `Invalid payment status transition: ${currentStatus} → ${newStatus}. ` +
          `Allowed: ${validTransitions[currentStatus]?.join(', ') || 'none'}`,
      );
    }

    // Require transaction_id for COMPLETED status
    if (newStatus === PaymentStatus.COMPLETED && !paymentDto.transaction_id) {
      throw new BadRequestException(
        'Transaction ID is required when marking payment as COMPLETED',
      );
    }

    const isRenewal = order.purchase_type !== PurchaseType.NEW;

    if (newStatus === PaymentStatus.REFUNDED && isRenewal) {
      throw new BadRequestException(
        'Refunding a renewal or extension is not supported automatically. Adjust the line manually.',
      );
    }

    if (newStatus === PaymentStatus.COMPLETED) {
      if (isRenewal) {
        // Renewal / extension: move the existing line, no new eSIM
        await this.applyRenewal(order);
      } else if (!order.esim_id) {
        // Handle Payment Completion (Assign eSIM)
        const customer = await this.db.query.users.findFirst({
          where: eq(users.user_id, order.customer_id),
        });
        const plan = await this.db.query.plans.findFirst({
          where: eq(plans.plan_id, order.plan_id),
        });

        await this.assignEsimToOrder(
          id,
          order,
          customer,
          ensureFound(plan, `Plan with ID ${order.plan_id} not found`),
        );
      }
    }

    // Handle Refund/Failure (Release eSIM)
    if (
      (newStatus === PaymentStatus.REFUNDED ||
        newStatus === PaymentStatus.FAILED) &&
      order.esim_id
    ) {
      await this.releaseEsimFromOrder(id, order.esim_id, newStatus);
    }

    // Update payment status
    await this.db
      .update(esimPurchases)
      .set({
        payment_status: newStatus,
        transaction_id: paymentDto.transaction_id,
        payment_reference: paymentDto.payment_reference,
      })
      .where(eq(esimPurchases.esim_purchase_id, id));

    const updatedOrder = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, id),
    });
    return mapToOrderResponse(
      ensureFound(updatedOrder, `Order with ID ${id} not found after update`),
    );
  }

  /** Manual payment status change by an admin, recorded in the audit log. */
  async updatePaymentStatusByAdmin(
    id: number,
    paymentDto: UpdatePaymentStatusDto,
    adminId: number,
  ): Promise<OrderResponseDto> {
    const result = await this.updatePaymentStatus(id, paymentDto);
    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PURCHASE,
      type: AdminActionType.UPDATE,
      entityId: id,
      notes: `Payment status set to ${paymentDto.payment_status} manually${paymentDto.transaction_id ? ` (transaction ${paymentDto.transaction_id})` : ''}`,
    });
    return result;
  }

  /** Extend the expiry of the original line once a renewal is paid. */
  private async applyRenewal(order: OrderRow): Promise<void> {
    if (!order.renews_purchase_id) {
      throw new BadRequestException('Renewal order has no original line');
    }
    const original = ensureFound(
      await this.validateOrderExists(order.renews_purchase_id),
      `Original order ${order.renews_purchase_id} not found`,
    );
    const plan = ensureFound(
      await this.db.query.plans.findFirst({
        where: eq(plans.plan_id, order.plan_id),
      }),
      `Plan with ID ${order.plan_id} not found`,
    );

    const today = toDateOnly(new Date());
    const newExpiry = projectExpiry(
      order.purchase_type,
      toDateOnly(original.expiry_date),
      plan.validity_days,
      today,
    );
    const newExpiryDate = fromDateOnly(newExpiry);

    await this.db.transaction(async (tx) => {
      // The line now runs on the renewal's plan (it may be a new plan)
      await tx
        .update(esimPurchases)
        .set({ expiry_date: newExpiryDate, plan_id: order.plan_id })
        .where(eq(esimPurchases.esim_purchase_id, original.esim_purchase_id));
      if (original.esim_id) {
        await tx
          .update(esims)
          .set({ plan_id: order.plan_id })
          .where(eq(esims.esim_id, original.esim_id));
      }
      await tx
        .update(esimPurchases)
        .set({
          expiry_date: newExpiryDate,
          activation_date: new Date(),
          purchase_status: PurchaseStatus.ACTIVATED,
        })
        .where(eq(esimPurchases.esim_purchase_id, order.esim_purchase_id));
    });

    this.logger.log(
      `${order.purchase_type} applied to line ${original.esim_purchase_id}: expiry now ${newExpiry}`,
    );
  }

  private async assignEsimToOrder(
    orderId: number,
    order: {
      plan_id: number;
      order_number: string;
      activation_date: Date | null;
      expiry_date: Date | null;
    },
    customer: { email: string; full_name: string } | undefined,
    plan: PlanRow,
  ): Promise<void> {
    const customerEmail = customer?.email ?? 'unknown';
    const customerName = customer?.full_name ?? 'Customer';
    const planName = plan.plan_name;

    await this.db.transaction(async (tx) => {
      // Any available eSIM of the provider; ones loaded for this plan first
      const [availableEsim] = await tx
        .select()
        .from(esims)
        .where(
          and(
            eq(esims.provider_id, plan.provider_id),
            eq(esims.status, EsimStatus.AVAILABLE),
          ),
        )
        .orderBy(
          sql`case when ${esims.plan_id} = ${plan.plan_id} then 0 else 1 end`,
          asc(esims.esim_id),
        )
        .limit(1)
        .for('update');

      if (!availableEsim) {
        throw new BadRequestException(
          `No available eSIMs for this provider (plan ${order.plan_id}). Please contact support.`,
        );
      }

      await tx
        .update(esimPurchases)
        .set({
          esim_id: availableEsim.esim_id,
          purchase_status: PurchaseStatus.CODE_SENT,
          sent_at: new Date(),
        })
        .where(eq(esimPurchases.esim_purchase_id, orderId));

      await tx
        .update(esims)
        .set({
          status: EsimStatus.ASSIGNED,
          plan_id: plan.plan_id,
        })
        .where(eq(esims.esim_id, availableEsim.esim_id));

      // Send email; the QR is left out when the plan hides it
      const emailSent = await this.emailService.sendEsimQrCode({
        includeQr: plan.show_qr,
        customerEmail,
        customerName,
        orderNumber: order.order_number,
        planName,
        qrCodeData: availableEsim.qr_code,
        iccid: availableEsim.iccid,
        activationDate: order.activation_date ?? new Date(),
        expiryDate: order.expiry_date ?? new Date(),
      });

      if (emailSent) {
        this.logger.log(
          `QR code email sent to ${customerEmail} for order ${orderId} (eSIM: ${availableEsim.iccid})`,
        );
      } else {
        this.logger.warn(
          `QR code ready for ${customerEmail} - order ${orderId} (eSIM: ${availableEsim.iccid}) - Email service disabled`,
        );
      }
    });
  }

  private async releaseEsimFromOrder(
    orderId: number,
    esimId: number,
    newStatus: PaymentStatus,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(esims)
        .set({
          status: EsimStatus.AVAILABLE,
        })
        .where(eq(esims.esim_id, esimId));

      await tx
        .update(esimPurchases)
        .set({
          esim_id: null,
          purchase_status:
            newStatus === PaymentStatus.REFUNDED
              ? PurchaseStatus.EXPIRED
              : PurchaseStatus.PENDING,
        })
        .where(eq(esimPurchases.esim_purchase_id, orderId));
    });
  }

  async deleteOrder(id: number, adminId: number): Promise<void> {
    const order = await this.validateOrderExists(id);

    // If an eSIM was assigned, release it back to the pool
    if (order.esim_id) {
      await this.db
        .update(esims)
        .set({
          status: EsimStatus.AVAILABLE,
        })
        .where(eq(esims.esim_id, order.esim_id));
    }

    await this.db
      .delete(esimPurchases)
      .where(eq(esimPurchases.esim_purchase_id, id));

    await this.adminService.logAction({
      adminId,
      category: AdminActionCategory.PURCHASE,
      type: AdminActionType.DELETE,
      entityId: id,
      notes: `Deleted order ${id}${order.esim_id ? ` and released eSIM ${order.esim_id}` : ''}`,
    });
  }

  private async validateOrderExists(id: number) {
    const order = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, id),
    });
    return ensureFound(order, `Order with ID ${id} not found`);
  }

  private generateOrderNumber(): string {
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
}
