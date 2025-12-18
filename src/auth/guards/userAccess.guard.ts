// src/auth/guards/userAccess.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../role';
@Injectable()
export class CheckUserAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // 👇 1
    if (!request.user) {
      throw new UnauthorizedException('You need to be signed in');
    }
    const { id: userId, role } = request.user;
    const id = request.params.id;
    // 👇 2
    if (id !== 'me' && id !== String(userId) && role !== Role.ADMIN) {
      throw new NotFoundException('No user with this id exists');
    }
    return true;
  }
}