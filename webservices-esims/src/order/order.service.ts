import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { esimPurchases, esims, plans, users } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  CreateOrderData,
  UpdateOrderDto,
  UpdatePaymentStatusDto,
  OrderResponseDto,
  OrderWithDetailsResponseDto,
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
} from '../enums/myenums';
import { pickDefined } from '../common/utils/object.utils';
import { ensureFound } from '../common/utils/service.helpers';
import type { Session } from '../common/types/auth';
import { Role } from '../auth/role';
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectDrizzle() private readonly db: DatabaseProvider,
    private readonly esimService: EsimService,
    private readonly adminService: AdminService,
    private readonly emailService: EmailService,
  ) {}
  async getOrders(user: Session): Promise<OrderWithDetailsResponseDto[]> {
    // Admins get all orders, customers get only their own
    if (user.role === Role.ADMIN) {
      return this.getAllOrders();
    }
    return this.getOrdersByUserId(user.userId);
  }
  async getAllOrders(): Promise<OrderWithDetailsResponseDto[]> {
    const orders = await this.db.query.esimPurchases.findMany({
      with: { esim: { with: { plan: true } } },
    });
    return orders.map(mapToOrderWithDetails);
  }
  async getOrderById(id: number): Promise<OrderWithDetailsResponseDto> {
    const order = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.esim_purchase_id, id),
      with: { esim: { with: { plan: true } } },
    });
    return mapToOrderWithDetails(
      ensureFound(order, `Order with ID ${id} not found`),
    );
  }
  async getOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderWithDetailsResponseDto> {
    const order = await this.db.query.esimPurchases.findFirst({
      where: eq(esimPurchases.order_number, orderNumber),
      with: { esim: { with: { plan: true } } },
    });
    return mapToOrderWithDetails(
      ensureFound(order, `Order with number ${orderNumber} not found`),
    );
  }
  async getOrdersByUserId(
    userId: number,
  ): Promise<OrderWithDetailsResponseDto[]> {
    const orders = await this.db.query.esimPurchases.findMany({
      where: eq(esimPurchases.customer_id, userId),
      with: { esim: { with: { plan: true } } },
    });
    return orders.map(mapToOrderWithDetails);
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
    // Validate plan exists and is active
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.plan_id, createOrderDto.plan_id),
    });
    if (!plan) {
      throw new BadRequestException(
        `Plan with ID ${createOrderDto.plan_id} not found`,
      );
    }
    if (!plan.is_active) {
      throw new BadRequestException(
        `Plan ${plan.plan_name} is not active and cannot be purchased`,
      );
    }

    // Check if there are available eSIMs for this plan
    const availableEsim = await this.db.query.esims.findFirst({
      where: and(
        eq(esims.plan_id, createOrderDto.plan_id),
        eq(esims.status, EsimStatus.AVAILABLE),
      ),
    });
    if (!availableEsim) {
      throw new BadRequestException(
        `No available eSIMs for plan ID ${createOrderDto.plan_id}. Please contact support.`,
      );
    }

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
      amount: plan.price, // Get from plan
      currency: 'EUR', // Default currency
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
        amount: plan.price,
        currency: 'EUR',
      })
      .catch(() => {
        // Ignore email send errors; order creation succeeded regardless
      });
    return mapToOrderResponse(foundCreatedOrder);
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
          amount: updateOrderDto.amount?.toString(),
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
    // Handle Payment Completion (Assign eSIM)
    if (newStatus === PaymentStatus.COMPLETED && !order.esim_id) {
      // Get customer and plan details for email
      const customer = await this.db.query.users.findFirst({
        where: eq(users.user_id, order.customer_id),
      });
      const plan = await this.db.query.plans.findFirst({
        where: eq(plans.plan_id, order.plan_id),
      });

      await this.assignEsimToOrder(id, order, customer, plan);
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
  private async assignEsimToOrder(
    orderId: number,
    order: {
      plan_id: number;
      order_number: string;
      activation_date: Date | null;
      expiry_date: Date | null;
    },
    customer: { email: string; full_name: string } | undefined,
    plan: { plan_name: string } | undefined,
  ): Promise<void> {
    const customerEmail = customer?.email ?? 'unknown';
    const customerName = customer?.full_name ?? 'Customer';
    const planName = plan?.plan_name ?? 'eSIM Plan';

    await this.db.transaction(async (tx) => {
      const [availableEsim] = await tx
        .select()
        .from(esims)
        .where(
          and(
            eq(esims.plan_id, order.plan_id),
            eq(esims.status, EsimStatus.AVAILABLE),
          ),
        )
        .limit(1);

      if (!availableEsim) {
        throw new BadRequestException(
          `No available eSIMs for plan ID ${order.plan_id}. Please contact support.`,
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
        })
        .where(eq(esims.esim_id, availableEsim.esim_id));

      // Send email with QR code
      const emailSent = await this.emailService.sendEsimQrCode({
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
