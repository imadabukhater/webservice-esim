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