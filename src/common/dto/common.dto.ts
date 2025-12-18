// Common Response DTOs used across all modules
import { ApiProperty } from '@nestjs/swagger';
export class DeleteResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;
  @ApiProperty({
    description: 'Success message',
    example: 'Resource deleted successfully',
  })
  message: string;
  @ApiProperty({ description: 'ID of deleted resource', example: 1 })
  deleted_id: number;
}
