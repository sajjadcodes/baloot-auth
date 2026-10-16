import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Short-lived password-reset token.',
    maxLength: 4096,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
