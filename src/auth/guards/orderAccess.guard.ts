import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../role';
import { OrderService } from '../../order/order.service';
@Injectable()
export class OrderAccessGuard implements CanActivate {
  constructor(private readonly orderService: OrderService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Check if user is authenticated
    if (!request.user) {
      throw new UnauthorizedException('You need to be signed in');
    }
    const { id: userId, role } = request.user;
    const orderId = request.params.id;
    const orderNumber = request.params.orderNumber;
    // Admins can access any order
    if (role === Role.ADMIN) {
      return true;
    }
    try {
      // Check order ownership
      let order;
      if (orderId) {
        order = await this.orderService.getOrderById(Number(orderId));
      } else if (orderNumber) {
        order = await this.orderService.getOrderByOrderNumber(
          String(orderNumber),
        );
      }
      // Customers can only access their own orders
      if (order && order.customer_id === userId) {
        return true;
      }
      throw new NotFoundException('Order not found or access denied');
    } catch {
      throw new NotFoundException('Order not found or access denied');
    }
  }
}
