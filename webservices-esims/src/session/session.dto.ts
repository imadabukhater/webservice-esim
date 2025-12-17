import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ description: 'Email address', example: 'user@example.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password', example: 'securePassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class LoginResponseDto {
  token: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({
    description: 'Email address to send reset link to',
    example: 'user@example.com',
  })
  @IsString()
  @IsEmail()
  email: string;
}

export class PasswordResetDto {
  @ApiProperty({ description: 'Password reset token received by email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'New password', example: 'NewSecure123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
