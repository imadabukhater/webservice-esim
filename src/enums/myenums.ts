export enum AdminActionCategory {
  ESIM = 'esim',
  PLAN = 'Plan',
  PROVIDER = 'Provider',
  CUSTOMER = 'Customer',
  PURCHASE = 'Purchase',
}
export enum AdminActionType {
  CREATE = 'Create',
  UPDATE = 'UPDATE',
  DELETE = 'Delete',
}
export enum EsimStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  EXPIRED = 'expired',
}
export enum PurchaseStatus {
  PENDING = 'pending',
  CODE_SENT = 'code_sent',
  ACTIVATED = 'activated',
  EXPIRED = 'expired',
}
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
export enum PaymentMethod {
  PAYPAL = 'paypal',
  CREDIT_CARD = 'credit_card',
  JAWWAL_PAY = 'jawwal_pay',
  BALANCE = 'balance',
}
export enum WalletProvider {
  JAWWAL_PAY = 'jawwal_pay',
}
export enum WalletTransactionSource {
  MAIL = 'mail',
  WEBHOOK = 'webhook',
  MANUAL = 'manual',
}
export enum WalletTransactionStatus {
  UNMATCHED = 'unmatched',
  MATCHED = 'matched',
  IGNORED = 'ignored',
}
export enum PaymentClaimStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  REJECTED = 'rejected',
}

export enum PurchaseType {
  NEW = 'new',
  RENEWAL = 'renewal',
  EXTENSION = 'extension',
}
export enum PaymentClaimPurpose {
  ORDER = 'order',
  TOPUP = 'topup',
}
export enum BalanceTransactionKind {
  TOPUP = 'topup',
  PURCHASE = 'purchase',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}
