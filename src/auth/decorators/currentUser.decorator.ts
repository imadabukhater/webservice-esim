// src/auth/decorators/currentUser.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Session } from '../../common/types/auth';
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Session => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    // Transform request.user to Session format
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  },
);