import { Controller, Post, Body, UseInterceptors } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { LoginRequestDto, LoginResponseDto } from './session.dto';
import { PasswordResetRequestDto, PasswordResetDto } from './session.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AuthDelayInterceptor } from '../auth/interceptors/authDelay.interceptor';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('sessions')
export class SessionController {
  constructor(private authService: AuthService) {}

  @UseInterceptors(AuthDelayInterceptor)
  @Post()
  @Public()
  @ApiOperation({ summary: 'Login user' })
  async signIn(@Body() loginDto: LoginRequestDto): Promise<LoginResponseDto> {
    const token = await this.authService.login(loginDto);
    return { token };
  }

  @Post('password-reset-request')
  @Public()
  @ApiOperation({ summary: 'Request a password reset link' })
  async requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    await this.authService.requestPasswordReset(body.email);
    // Always return 200 to avoid user enumeration
    return { ok: true };
  }

  @Post('password-reset')
  @Public()
  @ApiOperation({ summary: 'Reset password using token' })
  async resetPassword(@Body() body: PasswordResetDto) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { ok: true };
  }
}
