import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { delay } from 'rxjs/operators';
@Injectable()
export class AuthDelayInterceptor implements NestInterceptor {
  constructor(private configService: ConfigService) {}
  intercept(_: ExecutionContext, next: CallHandler) {
    const maxDelay = this.configService.get<number>('auth.maxDelay')!;
    const randomDelay = Math.round(Math.random() * maxDelay);
    return next.handle().pipe(delay(randomDelay));
  }
}