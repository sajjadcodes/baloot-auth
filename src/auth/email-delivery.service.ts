import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailDeliveryService {
  constructor(private readonly config: ConfigService) {}

  async send(email: OutboundEmail): Promise<void> {
    const resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: this.config.getOrThrow<string>('AUTH_EMAIL_FROM'),
      ...email,
    });

    if (error) {
      throw new Error(`Resend email delivery failed: ${error.message}`);
    }
  }
}
