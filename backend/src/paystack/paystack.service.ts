import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Env } from '../config/env';

export const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// The fields CampusMart reads from a Paystack transaction (charge.success and /transaction/verify)
export interface PaystackTransaction {
  reference: string;
  status: string; // 'success', 'failed', 'abandoned', ...
  amount: number; // kobo
  currency: string;
  channel?: string;
  fees?: number | null; // kobo
  paid_at?: string | null;
  gateway_response?: string;
}

export interface PaystackBank {
  name: string;
  code: string;
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}

// A thin client for the Paystack endpoints the guide uses (5.1 to 5.6). Tests mock the host with
// nock; nothing here ever runs against live Paystack outside a real deployment.
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return this.config.get('PAYMENTS_ENABLED', { infer: true });
  }

  initialize(body: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl: string;
    channels: string[];
    metadata: Record<string, string>;
  }) {
    return this.request<{ authorization_url: string; reference: string }>(
      'POST',
      '/transaction/initialize',
      {
        email: body.email,
        amount: body.amountKobo,
        currency: 'NGN',
        reference: body.reference,
        callback_url: body.callbackUrl,
        channels: body.channels,
        metadata: body.metadata,
      },
    );
  }

  verify(reference: string) {
    return this.request<PaystackTransaction>(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }

  banks() {
    return this.request<PaystackBank[]>(
      'GET',
      '/bank?country=nigeria&currency=NGN&perPage=100',
    );
  }

  resolveAccount(accountNumber: string, bankCode: string) {
    return this.request<{ account_name: string; account_number: string }>(
      'GET',
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    );
  }

  createRecipient(body: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }) {
    return this.request<{ recipient_code: string }>(
      'POST',
      '/transferrecipient',
      {
        type: 'nuban',
        name: body.name,
        account_number: body.accountNumber,
        bank_code: body.bankCode,
        currency: 'NGN',
      },
    );
  }

  transfer(body: {
    amountKobo: number;
    recipient: string;
    reference: string;
    reason: string;
  }) {
    return this.request<{ transfer_code: string; status: string }>(
      'POST',
      '/transfer',
      {
        source: 'balance',
        amount: body.amountKobo,
        recipient: body.recipient,
        reference: body.reference,
        reason: body.reason,
      },
    );
  }

  refund(body: { transaction: string; amountKobo: number }) {
    return this.request<{ id: number; status: string }>('POST', '/refund', {
      transaction: body.transaction,
      amount: body.amountKobo,
    });
  }

  // Guide 5.2 step 2: HMAC-SHA512 of the raw body with the secret key, compared in constant time
  verifySignature(rawBody: Buffer | undefined, signature: unknown): boolean {
    const secret = this.config.get('PAYSTACK_SECRET_KEY', { infer: true });
    if (!secret || !rawBody || typeof signature !== 'string') return false;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const given = Buffer.from(signature, 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    return given.length === wanted.length && timingSafeEqual(given, wanted);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const secret = this.config.get('PAYSTACK_SECRET_KEY', { infer: true });
    if (!this.enabled || !secret) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: "Online payment isn't switched on yet",
      });
    }
    let res: Response;
    try {
      res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(
        `Paystack ${method} ${path.split('?')[0]} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw providerError();
    }
    const json = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!res.ok || !json?.status) {
      this.logger.warn(
        `Paystack ${method} ${path.split('?')[0]} answered ${res.status}: ${json?.message ?? 'no body'}`,
      );
      throw providerError(json?.message);
    }
    return json.data;
  }
}

// Paystack said no, or didn't answer. The message is Paystack's own when it gave one (e.g. "Could
// not resolve account name"), which is safe to show.
export const providerError = (message?: string) =>
  new BadGatewayException({
    code: 'PAYMENT_PROVIDER_ERROR',
    message:
      message ?? "We couldn't reach the payment provider. Please try again.",
  });
