import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  InjectDrizzle,
  type DatabaseProvider,
} from '../drizzle/drizzle.provider';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthConfig, ServerConfig } from '../config/configuration';
import { UserEntity } from '../common/types/entities';
import { JwtPayload } from '../common/types/auth';
import { RegisterUserDto, UserResponseDto } from '../user/dto/user.dto';
import { LoginRequestDto } from '../session/session.dto';
import { users } from '../drizzle/schema';
import { passwordResets } from '../drizzle/schema';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { Role } from '../auth/role';
import { mapToUserResponse } from '../common/mappers';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';
@Injectable()
export class AuthService {
  constructor(
    @InjectDrizzle()
    private readonly db: DatabaseProvider,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<ServerConfig>,
    private readonly emailService: EmailService,
  ) {}
  async hashPassword(password: string): Promise<string> {
    const { hashLength, timeCost, memoryCost } =
      this.configService.get<AuthConfig>('auth')!;
    return argon2.hash(password, {
      type: argon2.argon2id,
      hashLength,
      timeCost,
      memoryCost,
    });
  }
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
  async verifyJwt(token: string): Promise<JwtPayload> {
    const { jwt } = this.configService.get<AuthConfig>('auth')!;
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: jwt.secret,
        audience: jwt.audience,
        issuer: jwt.issuer,
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authentication token',
      );
    }
  }
  async login({ email, password }: LoginRequestDto): Promise<string> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      throw new UnauthorizedException(
        'The given email and password do not match',
      );
    }
    const isPasswordValid = await this.verifyPassword(
      password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'The given email and password do not match',
      );
    }
    return this.signJwt(user);
  }
  async registerUser(
    dto: RegisterUserDto,
  ): Promise<{ accessToken: string; user: UserResponseDto }> {
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }
    const passwordHash = await this.hashPassword(dto.password);

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: dto.email,
        password_hash: passwordHash,
        full_name: dto.full_name,
        phone_number: dto.phone_number ?? null,
        role: Role.CUSTOMER,
        is_active: true,
      })
      .$returningId();
    const user = await this.db.query.users.findFirst({
      where: eq(users.user_id, newUser.user_id),
    });
    if (!user) {
      throw new InternalServerErrorException('User creation failed');
    }

    this.emailService
      .sendWelcomeEmail({
        email: user.email,
        fullName: user.full_name,
      })
      .catch(() => {
        // Silently ignore email errors - user is still created
      });

    return { accessToken: this.signJwt(user), user: mapToUserResponse(user) };
  }

  /**
   * Create a password reset token and email it to the user (non-blocking).
   * We store only the hash of the token in the database.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      // Do not reveal whether user exists
      return;
    }

    // Remove any existing tokens for this user
    await this.db
      .delete(passwordResets)
      .where(eq(passwordResets.user_id, user.user_id));

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await this.hashPassword(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await this.db.insert(passwordResets).values({
      user_id: user.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    // Send email (don't fail the request if email sending fails)
    this.emailService
      .sendPasswordResetEmail({
        email: user.email,
        fullName: user.full_name,
        resetToken: token,
      })
      .catch(() => {});
  }

  /**
   * Verify token and set new password.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Find matching password reset by verifying against stored hashes
    const resets = await this.db.query.passwordResets.findMany({
      with: { user: true },
    });
    for (const r of resets) {
      // Check expiry first
      if (r.expires_at && r.expires_at.getTime() < Date.now()) continue;
      try {
        const match = await this.verifyPassword(token, r.token_hash);
        if (match) {
          // Update user password
          const newHash = await this.hashPassword(newPassword);
          await this.db
            .update(users)
            .set({ password_hash: newHash })
            .where(eq(users.user_id, r.user_id));
          // Delete used token(s)
          await this.db
            .delete(passwordResets)
            .where(eq(passwordResets.user_id, r.user_id));
          return;
        }
      } catch {
        // ignore argon verify errors and continue
      }
    }
    throw new BadRequestException('Invalid or expired password reset token');
  }

  private signJwt(user: UserEntity): string {
    const { jwt } = this.configService.get<AuthConfig>('auth')!;
    return this.jwtService.sign(
      { sub: user.user_id, email: user.email, role: user.role },
      {
        secret: jwt.secret,
        audience: jwt.audience,
        issuer: jwt.issuer,
        expiresIn: jwt.expirationInterval,
      },
    );
  }
}
