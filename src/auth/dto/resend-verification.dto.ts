import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({ example: 'person@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
