import { PurchaseType } from '../../enums/myenums';

/** Calendar date (YYYY-MM-DD) in UTC, the format used by date columns. */
export const toDateOnly = (value: Date): string =>
  value.toISOString().slice(0, 10);

export const addDaysDateOnly = (date: string, days: number): string => {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return toDateOnly(result);
};

/**
 * New expiry date of an eSIM line after a renewal or an extension.
 * - renewal: a fresh validity period starts today.
 * - extension: validity days are added to the current expiry (or to today
 *   if the line has already expired).
 */
export const projectExpiry = (
  type: PurchaseType,
  currentExpiry: string,
  validityDays: number,
  today: string,
): string => {
  if (type === PurchaseType.EXTENSION) {
    const base = currentExpiry > today ? currentExpiry : today;
    return addDaysDateOnly(base, validityDays);
  }
  return addDaysDateOnly(today, validityDays);
};

/** UTC midnight Date for a day string, for writing to date columns. */
export const fromDateOnly = (date: string): Date =>
  new Date(`${date}T00:00:00Z`);
