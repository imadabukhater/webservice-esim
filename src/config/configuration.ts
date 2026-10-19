export default () => ({
  env: process.env.NODE_ENV,
  log: {
    levels: process.env.LOG_LEVELS
      ? (JSON.parse(process.env.LOG_LEVELS) as LogLevel[])
      : ['log', 'error', 'warn'],
    disabled: process.env.LOG_DISABLED === 'true',
  },
  port: parseInt(process.env.PORT || '9000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    hashLength: parseInt(process.env.AUTH_HASH_LENGTH || '32'),
    timeCost: parseInt(process.env.AUTH_HASH_TIME_COST || '6'),
    memoryCost: parseInt(process.env.AUTH_HASH_MEMORY_COST || '65536'),
    maxDelay: parseInt(process.env.AUTH_MAX_DELAY || '1000'),
    jwt: {
      expirationInterval:
        Number(process.env.AUTH_JWT_EXPIRATION_INTERVAL) || 3600,
      secret: process.env.AUTH_JWT_SECRET || '',
      audience: process.env.AUTH_JWT_AUDIENCE || 'eSIM.Platform',
      issuer: process.env.AUTH_JWT_ISSUER || 'eSIM.Platform',
    },
  },
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || '',
    fromName: process.env.EMAIL_FROM_NAME || 'eSIM Platform',
  },
  payment: {
    // Currency new orders are priced in; must equal the wallet's currency
    // for automatic matching (Jawwal Pay notifications are in ILS).
    currency: (process.env.PAYMENT_CURRENCY || 'ILS').toUpperCase(),
    // Wallet details shown to the customer so they know where to transfer.
    walletNumber: process.env.PAYMENT_WALLET_NUMBER || '',
    walletName: process.env.PAYMENT_WALLET_NAME || '',
    // Only transfers received within this window are eligible for matching.
    matchWindowHours: parseInt(
      process.env.PAYMENT_MATCH_WINDOW_HOURS || '72',
      10,
    ),
    // Accept transfers larger than the order amount (customer over-paid).
    allowOverpayment: process.env.PAYMENT_ALLOW_OVERPAYMENT !== 'false',
    // How many times a customer may (re)submit a claim per order.
    maxClaimAttempts: parseInt(
      process.env.PAYMENT_MAX_CLAIM_ATTEMPTS || '10',
      10,
    ),
    // Shared secret for POST /api/payments/notifications (x-payment-secret).
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
    // Jawwal Pay e-mails ("تمت حركة تحويل الأموال ...") do not say whether
    // money came in or went out. The balance change decides when possible;
    // otherwise: 'incoming' (default) or 'ignore'.
    unknownDirection:
      process.env.PAYMENT_UNKNOWN_DIRECTION === 'ignore'
        ? 'ignore'
        : 'incoming',
    mail: {
      // Poll the Gmail inbox (IMAP) for Jawwal Pay notifications.
      enabled: process.env.PAYMENT_MAIL_ENABLED === 'true',
      host: process.env.PAYMENT_MAIL_HOST || 'imap.gmail.com',
      port: parseInt(process.env.PAYMENT_MAIL_PORT || '993', 10),
      secure: process.env.PAYMENT_MAIL_SECURE !== 'false',
      user: process.env.PAYMENT_MAIL_USER || process.env.EMAIL_USER || '',
      pass: process.env.PAYMENT_MAIL_PASS || process.env.EMAIL_PASS || '',
      mailbox: process.env.PAYMENT_MAIL_MAILBOX || 'INBOX',
      // Optional IMAP filters: only look at mails from / with subject.
      // Only read Jawwal Pay mails by default (set to empty to read all)
      fromFilter: process.env.PAYMENT_MAIL_FROM_FILTER ?? 'jawwalpay.ps',
      subjectFilter: process.env.PAYMENT_MAIL_SUBJECT_FILTER || '',
      pollIntervalSeconds: parseInt(
        process.env.PAYMENT_MAIL_POLL_INTERVAL_SECONDS || '60',
        10,
      ),
      // Mark processed notification mails as read.
      markSeen: process.env.PAYMENT_MAIL_MARK_SEEN !== 'false',
    },
  },
});
type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';
export interface LogConfig {
  levels: LogLevel[];
  disabled: boolean;
}
export interface DatabaseConfig {
  url: string;
}
export interface JwtConfig {
  expirationInterval: number;
  secret: string;
  audience: string;
  issuer: string;
}
export interface AuthConfig {
  hashLength: number;
  timeCost: number;
  memoryCost: number;
  jwt: JwtConfig;
  maxDelay: number;
}
export interface PaymentMailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  fromFilter: string;
  subjectFilter: string;
  pollIntervalSeconds: number;
  markSeen: boolean;
}
export interface PaymentConfig {
  currency: string;
  walletNumber: string;
  walletName: string;
  matchWindowHours: number;
  allowOverpayment: boolean;
  maxClaimAttempts: number;
  webhookSecret: string;
  unknownDirection: 'incoming' | 'ignore';
  mail: PaymentMailConfig;
}
export interface ServerConfig {
  env: string;
  port: number;
  database: DatabaseConfig;
  log: LogConfig;
  auth: AuthConfig;
  payment: PaymentConfig;
}
