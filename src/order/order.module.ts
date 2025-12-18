import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { OrderAccessGuard } from '../auth/guards/orderAccess.guard';
import { EsimModule } from '../esim/esim.module';
import { UserModule } from '../user/user.module';
@Module({
  imports: [DrizzleModule, EsimModule, UserModule],
  controllers: [OrderController],
  providers: [OrderService, OrderAccessGuard],
  exports: [OrderService],
})
export class OrderModule {}
