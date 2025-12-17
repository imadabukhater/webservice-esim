import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { CustomerController } from './customer.controller';
import { AdminController } from './admin.controller';
import { UserService } from './user.service';
import { CustomerService } from './customer.service';
import { AdminService } from './admin.service';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [DrizzleModule, AuthModule],
  controllers: [UserController, CustomerController, AdminController],
  providers: [UserService, CustomerService, AdminService],
  exports: [UserService, CustomerService, AdminService],
})
export class UserModule {}