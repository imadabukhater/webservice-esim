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
  UpdateOrderDto,
  UpdatePaymentStatusDto,
  OrderResponseDto,
  OrderWithDetailsResponseDto,
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
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderWithDetailsResponseDto> {
    return this.orderService.getOrderById(id);
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
