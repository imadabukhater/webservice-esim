import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { UserModule } from '../user/user.module';
@Module({
  imports: [DrizzleModule, UserModule],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}