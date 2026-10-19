/**
 * Parsing and matching helpers for Jawwal Pay wallet notifications.
 *
 * Example notification (received by e-mail):
 *   لقد استلمت حركه تحويل اموال بقيمة: ILS 1.00 من المعتز بالله عاطف ابو خاطر .
 *   الرصيد الحالي: ILS 424.00 .المرجع :(2922922584908)
 *
 * All functions here are pure so they can be unit-tested without a database.
 */
export type TransferDirection = 'incoming' | 'outgoing' | 'unknown';

export interface ParsedWalletNotification {
  amount: string; // decimal string, e.g. "1.00"
  currency: string; // ISO code, e.g. "ILS"
  /** Who paid (only when the notification names the counterparty). */
  senderName: string | null;
  senderPhone: string | null;
  balanceAfter: string | null;
  reference: string;
  /**
   * incoming / outgoing when the wording says so; unknown for the generic
   * Jawwal Pay e-mail ("تمت حركة تحويل الأموال لمبلغ ... بنجاح") which does
   * not say which way the money went.
   */
  direction: TransferDirection;
  /** The wallet owner the e-mail is addressed to ("للمشترك: ..."). */
  accountHolder: string | null;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Convert Arabic-Indic / Persian digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_DIGITS.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(d));
  });
}

/** Strip HTML tags / entities so HTML e-mails can be parsed like plain text. */
export function htmlToText(input: string): string {
  return input
    .replace(/<\s*(br|p|div|tr|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(Number(c)));
}

/**
 * Normalise an Arabic (or Latin) person name so that spelling variants
 * compare equal: diacritics, tatweel, alef/ya/ta-marbuta variants, case
 * and whitespace are folded.
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return '';
  return toAsciiDigits(input)
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name tokens with the Arabic definite article ("ال") removed. */
export function nameTokens(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.startsWith('ال') ? t.slice(2) : t))
    .filter((t) => t.length > 1);
}

/**
 * Decide whether the name a customer typed matches the sender name that
 * appears in the wallet notification. Deliberately tolerant to missing
 * middle names and to joined words such as "عبدالله" vs "عبد الله", but
 * requires at least two significant tokens to agree so that a single very
 * common first name is never enough.
 */
export function namesMatch(
  claimedName: string | null | undefined,
  senderName: string | null | undefined,
): boolean {
  const claimed = normalizeName(claimedName);
  const sender = normalizeName(senderName);
  if (!claimed || !sender) return false;
  if (claimed === sender) return true;

  const claimedTokens = nameTokens(claimed);
  const senderTokens = nameTokens(sender);
  if (claimedTokens.length === 0 || senderTokens.length === 0) return false;

  const senderJoined = senderTokens.join('');
  const claimedJoined = claimedTokens.join('');
  // "عبدالله ابو خاطر" typed without spaces vs "عبد الله ابو خاطر"
  if (claimedJoined.length >= 6 && senderJoined.includes(claimedJoined)) {
    return true;
  }

  const senderSet = new Set(senderTokens);
  const overlap = claimedTokens.filter((t) => senderSet.has(t)).length;
  if (overlap >= 2) return true;
  // Every claimed token present (e.g. customer typed first + last name only)
  return overlap === claimedTokens.length && claimedJoined.length >= 6;
}

/**
 * Normalise a Palestinian / Israeli mobile number to its last 9 digits so
 * that "0599123456", "+970599123456" and "972599123456" compare equal.
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  const digits = toAsciiDigits(input).replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-9);
}

export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return !!na && na === nb;
}

/** Digits-only representation of a payment reference. */
export function normalizeReference(input: string | null | undefined): string {
  if (!input) return '';
  return toAsciiDigits(input).replace(/\D/g, '');
}

function parseAmount(raw: string): string | null {
  const cleaned = raw.replace(/,/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toFixed(2);
}

const CURRENCY = '(?:ILS|NIS|USD|EUR|JOD|₪|\\$|€)';
const CURRENCY_MAP: Record<string, string> = {
  '₪': 'ILS',
  NIS: 'ILS',
  $: 'USD',
  '€': 'EUR',
};
function normalizeCurrency(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const up = raw.toUpperCase();
  return CURRENCY_MAP[up] ?? up;
}

const AMOUNT = '([0-9][0-9,]*(?:\\.[0-9]+)?)';

// Wording that says which way the money moved
const INCOMING_WORDS =
  /استلمت|استلام|استلم|وارد|إيداع|ايداع|received|deposit|من المشترك|من حساب|من محفظة/i;
const OUTGOING_WORDS =
  /قمت بتحويل|أرسلت|ارسلت|إرسال|ارسال|سحب|دفع فاتورة|شراء|إلى المشترك|الى المشترك|إلى حساب|الى حساب|إلى محفظة|الى محفظة|\bsent\b|withdraw/i;

/**
 * Extract the transfer details from a Jawwal Pay notification (SMS text or
 * e-mail body). Two shapes are known:
 *
 *  1. "لقد استلمت حركه تحويل اموال بقيمة: ILS 1.00 من <payer> . الرصيد
 *     الحالي: ILS 424.00 .المرجع :(2922922584908)"           -> incoming
 *  2. noreply@jawwalpay.ps e-mail:
 *     "للمشترك: <wallet owner>: تمت حركة تحويل الأموال لمبلغ ILS 1.00
 *     بنجاح! رصيدك الحالي: ILS 802.00. رقم الحركة: 2922940429243."
 *     The name here is the wallet OWNER, not the payer, and the direction
 *     is not stated (direction = unknown; the service decides it).
 *
 * Returns null for anything that is not a money-transfer notification.
 */
export function parseJawwalPayNotification(
  rawText: string,
  defaultCurrency = 'ILS',
): ParsedWalletNotification | null {
  if (!rawText) return null;
  const text = toAsciiDigits(htmlToText(rawText))
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Must be about a money transfer
  if (!/تحويل|حوالة|استلم|استلام|received|transfer/i.test(text)) return null;

  // Amount: after "بقيمة / بمبلغ / لمبلغ / مبلغ / amount"
  const amountMatch = new RegExp(
    `(?:بقيمة|مبلغ|قيمة|amount)\\s*:?\\s*(${CURRENCY})?\\s*${AMOUNT}\\s*(${CURRENCY})?`,
    'i',
  ).exec(text);
  if (!amountMatch) return null;
  const amount = parseAmount(amountMatch[2]);
  if (!amount) return null;
  const currency = normalizeCurrency(
    amountMatch[1] ?? amountMatch[3],
    defaultCurrency,
  );

  const referenceMatch =
    /(?:المرجع|مرجع|رقم الحركة|رقم الحركه|رقم العملية|reference|ref|transaction(?: no\.?| number| id)?)\s*(?:رقم)?\s*:?\s*\(?\s*([0-9]{5,})\s*\)?/i.exec(
      text,
    );
  if (!referenceMatch) return null;
  const reference = referenceMatch[1];

  const balanceMatch = new RegExp(
    `(?:رصيدك الحالي|رصيدك|الرصيد الحالي|الرصيد|balance)\\s*:?\\s*(?:${CURRENCY})?\\s*${AMOUNT}`,
    'i',
  ).exec(text);
  const balanceAfter = balanceMatch ? parseAmount(balanceMatch[1]) : null;

  // "للمشترك: <name>" addresses the wallet owner - never the payer
  let accountHolder: string | null = null;
  const holderMatch = /للمشترك\s*:?\s*(.+?)\s*(?::|تمت|تم\s|$)/.exec(text);
  if (holderMatch && holderMatch[1].trim()) {
    accountHolder = holderMatch[1].trim().slice(0, 150);
  }

  const incoming = INCOMING_WORDS.test(text);
  const outgoing = OUTGOING_WORDS.test(text);
  const direction: TransferDirection =
    incoming && !outgoing
      ? 'incoming'
      : outgoing && !incoming
        ? 'outgoing'
        : 'unknown';

  // Payer: only when the text says "من <name>" (from) after the amount
  let senderName: string | null = null;
  let senderPhone: string | null = null;
  const senderMatch =
    /(?:^|\s)(?:من|from)\s+(?:المشترك\s*:?\s*|رقم\s+|المحفظة\s+|محفظة\s+)?(.+?)\s*(?:[.،,؛;!]|بنجاح|الرصيد|رصيدك|المرجع|رقم الحركة|balance|reference|$)/i.exec(
      text.slice(amountMatch.index + amountMatch[0].length),
    );
  if (senderMatch && direction !== 'outgoing') {
    const candidate = senderMatch[1].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length >= candidate.length / 2) {
      senderPhone = digits;
    } else if (candidate) {
      senderName = candidate.slice(0, 150);
    }
  }

  return {
    amount,
    currency,
    senderName,
    senderPhone,
    balanceAfter,
    reference,
    direction,
    accountHolder,
  };
}
