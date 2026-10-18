import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { MailPollerService } from './mail-poller.service';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { OrderModule } from '../order/order.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [DrizzleModule, OrderModule, UserModule],
  controllers: [PaymentController],
  providers: [PaymentService, MailPollerService],
  exports: [PaymentService],
})
export class PaymentModule {}
