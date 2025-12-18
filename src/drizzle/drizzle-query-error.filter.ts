import { Catch, ConflictException, NotFoundException } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
@Catch(DrizzleQueryError)
export class DrizzleQueryErrorFilter implements ExceptionFilter {
  catch(error: DrizzleQueryError) {
    if (
      !error.cause ||
      typeof error.cause !== 'object' ||
      !('code' in error.cause)
    ) {
      throw error;
    }
    const cause = error.cause as { code?: string; message?: string };
    const code = cause.code ?? '';
    const message = (cause.message ?? '').toLowerCase();
    switch (code) {
      case 'ER_DUP_ENTRY': {
        if (
          message.includes('email') ||
          (message.includes('users') && message.includes('email'))
        ) {
          throw new ConflictException(
            'A user with this email address already exists.',
          );
        }
        if (
          message.includes('provider') ||
          message.includes('providers') ||
          message.includes('provider_name')
        ) {
          throw new ConflictException(
            'A provider with this name already exists.',
          );
        }
        if (message.includes('plan') || message.includes('plan_name')) {
          throw new ConflictException(
            'A plan with the same name already exists for this provider.',
          );
        }
        throw new ConflictException(
          'Resource conflict: a unique constraint was violated.',
        );
      }
      case 'ER_NO_REFERENCED_ROW_2':
      case 'ER_NO_REFERENCED_ROW': {
        if (message.includes('user') || message.includes('users')) {
          throw new NotFoundException('Related user not found.');
        }
        if (message.includes('customer')) {
          throw new NotFoundException('Related customer not found.');
        }
        if (message.includes('provider') || message.includes('providers')) {
          throw new NotFoundException('Related provider not found.');
        }
        if (message.includes('plan') || message.includes('plans')) {
          throw new NotFoundException('Related plan not found.');
        }
        throw new NotFoundException('Related resource not found.');
      }
      default:
        throw error;
    }
  }
}
export default DrizzleQueryErrorFilter;