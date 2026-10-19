import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  HttpCode,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  CreateOrderDto,
  RenewOrderDto,
  UpdateOrderDto,
  UpdatePaymentStatusDto,
  OrderResponseDto,
  OrderWithDetailsResponseDto,
  OrderQrResponseDto,
} from './dto/order.dto';
import { OrderService } from './order.service';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';
import type { Session } from '../common/types/auth';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/role';
import { OrderAccessGuard } from '../auth/guards/orderAccess.guard';
@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}
  @Get()
  @ApiOperation({
    summary: 'Get orders - Admins get all, Customers get their own',
  })
  @ApiResponse({
    status: 200,
    description: 'List of orders with details',
    type: [OrderWithDetailsResponseDto],
  })
  async getOrders(
    @CurrentUser() user: Session,
  ): Promise<OrderWithDetailsResponseDto[]> {
    return this.orderService.getOrders(user);
  }
  @Get(':id')
  @UseGuards(OrderAccessGuard)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Order details',
    type: OrderWithDetailsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderWithDetailsResponseDto> {
    return this.orderService.getOrderById(id, user);
  }

  @Get(':id/qr')
  @UseGuards(OrderAccessGuard)
  @ApiOperation({
    summary:
      'QR code of a paid order as text and PNG image (owner or admin). Hidden for plans that do not show the QR.',
  })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({ status: 200, type: OrderQrResponseDto })
  @ApiResponse({ status: 400, description: 'Not paid or QR hidden' })
  async getOrderQr(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderQrResponseDto> {
    return this.orderService.getOrderQr(id, user);
  }
  @Post()
  @Roles(Role.CUSTOMER)
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new order (Customer only)' })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createOrder(
    @CurrentUser() user: Session,
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const orderData = { ...createOrderDto, customer_id: user.userId };
    return this.orderService.createOrder(orderData);
  }
  @Post(':id/renew')
  @UseGuards(OrderAccessGuard)
  @Roles(Role.CUSTOMER)
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Renew or extend your eSIM line (Customer only). Costs the same as the plan.',
  })
  @ApiParam({ name: 'id', description: 'Original order ID', example: 1 })
  @ApiResponse({
    status: 201,
    description: 'Renewal order created; pay it to apply the change',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Line cannot be renewed' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async renewOrder(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
    @Body() renewOrderDto: RenewOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.createRenewalOrder(
      user.userId,
      id,
      renewOrderDto.type,
      renewOrderDto.plan_id,
    );
  }

  @Post(':id/activate')
  @UseGuards(OrderAccessGuard)
  @Roles(Role.CUSTOMER)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Activate the eSIM of a paid order (Customer only)',
  })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Order activated; includes the eSIM QR code',
    type: OrderWithDetailsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Order is not paid' })
  async activateOrder(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderWithDetailsResponseDto> {
    return this.orderService.activateOrder(id, user.userId);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({ summary: 'Update an order (Admin only)' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Order updated successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateOrder(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateOrder(id, updateOrderDto, user.userId);
  }
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an order (Admin only)' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({ status: 204, description: 'Order deleted successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async deleteOrder(
    @CurrentUser() user: Session,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.orderService.deleteOrder(id, user.userId);
  }
  @Patch(':id/payment-status')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update order payment status (Public for testing)',
    description:
      'Update payment status. TODO: Secure this endpoint in production!',
  })
  @ApiParam({ name: 'id', description: 'Order ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payment status updated successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updatePaymentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePaymentStatusDto: UpdatePaymentStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updatePaymentStatus(id, updatePaymentStatusDto);
  }
}
