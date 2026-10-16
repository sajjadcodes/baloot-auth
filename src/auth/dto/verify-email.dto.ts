import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Short-lived email verification token.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  token!: string;
}
