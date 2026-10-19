import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PaymentService } from './payment.service';
import { WalletTransactionSource } from '../enums/myenums';
import type { PaymentMailConfig } from '../config/configuration';
import { htmlToText } from './jawwal-pay.parser';

/**
 * Polls the Gmail inbox over IMAP for Jawwal Pay notification e-mails and
 * feeds them into the PaymentService. Gmail requires an "App password"
 * (Google account -> Security -> 2-Step Verification -> App passwords).
 */
@Injectable()
export class MailPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailPollerService.name);
  private readonly config: PaymentMailConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly paymentService: PaymentService,
    configService: ConfigService,
  ) {
    this.config = configService.get<PaymentMailConfig>('payment.mail')!;
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.warn(
        'Payment mail polling disabled. Set PAYMENT_MAIL_ENABLED=true to read Jawwal Pay notifications from Gmail.',
      );
      return;
    }
    if (!this.config.user || !this.config.pass) {
      this.logger.error(
        'PAYMENT_MAIL_ENABLED=true but PAYMENT_MAIL_USER / PAYMENT_MAIL_PASS are missing; polling disabled.',
      );
      return;
    }
    const intervalMs = Math.max(15, this.config.pollIntervalSeconds) * 1000;
    this.logger.log(
      `Polling ${this.config.user}@${this.config.host}/${this.config.mailbox} every ${intervalMs / 1000}s for wallet notifications`,
    );
    this.timer = setInterval(() => void this.pollOnce(), intervalMs);
    this.timer.unref();
    void this.pollOnce();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One polling round. Safe to call concurrently (re-entrancy guarded). */
  async pollOnce(): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.pass },
      logger: false,
    });
    let processed = 0;
    try {
      await client.connect();
      const lock = await client.getMailboxLock(this.config.mailbox);
      try {
        const query: { seen: boolean; from?: string; subject?: string } = {
          seen: false,
        };
        if (this.config.fromFilter) query.from = this.config.fromFilter;
        if (this.config.subjectFilter)
          query.subject = this.config.subjectFilter;

        const uids = await client.search(query, { uid: true });
        if (!uids || uids.length === 0) return 0;

        const messages = await client.fetchAll(
          uids,
          { uid: true, source: true, internalDate: true, envelope: true },
          { uid: true },
        );
        for (const message of messages) {
          if (!message.source) continue;
          try {
            const parsed = await simpleParser(message.source);
            const text =
              (parsed.text && parsed.text.trim()) ||
              (parsed.html ? htmlToText(parsed.html) : '') ||
              parsed.subject ||
              '';
            const receivedAt =
              parsed.date ??
              (message.internalDate
                ? new Date(message.internalDate)
                : new Date());
            const result = await this.paymentService.ingestNotification({
              text,
              source: WalletTransactionSource.MAIL,
              receivedAt,
            });
            processed++;
            // Mark recognised notifications (incl. stored outgoing ones) as read
            if (
              (result.status !== 'ignored' || result.transaction) &&
              this.config.markSeen
            ) {
              await client.messageFlagsAdd(
                { uid: String(message.uid) },
                ['\\Seen'],
                { uid: true },
              );
            }
          } catch (error) {
            this.logger.error(
              `Failed to process mail uid ${message.uid}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (error) {
      this.logger.error(
        `Mail polling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        client.close();
      } catch {
        // ignore
      }
    } finally {
      this.running = false;
    }
    return processed;
  }
}
