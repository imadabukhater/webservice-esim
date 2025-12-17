import { Module } from '@nestjs/common';
import { EsimController } from './esim.controller';
import { EsimService } from './esim.service';
import { DrizzleModule } from '../drizzle/drizzle.module';
import { UserModule } from '../user/user.module';
@Module({
  imports: [DrizzleModule, UserModule],
  controllers: [EsimController],
  providers: [EsimService],
  exports: [EsimService],
})
export class EsimModule {}
