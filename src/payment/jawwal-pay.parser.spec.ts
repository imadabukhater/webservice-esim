import {
  namesMatch,
  normalizeName,
  normalizePhone,
  parseJawwalPayNotification,
  phonesMatch,
} from './jawwal-pay.parser';

const SAMPLE =
  'لقد استلمت حركه تحويل اموال بقيمة: ILS 1.00 من المعتز بالله عاطف ابو خاطر . الرصيد الحالي: ILS 424.00 .المرجع :(2922922584908)';

describe('parseJawwalPayNotification', () => {
  it('parses the reference Jawwal Pay notification', () => {
    const parsed = parseJawwalPayNotification(SAMPLE);
    expect(parsed).toEqual({
      amount: '1.00',
      currency: 'ILS',
      senderName: 'المعتز بالله عاطف ابو خاطر',
      senderPhone: null,
      balanceAfter: '424.00',
      reference: '2922922584908',
      direction: 'incoming',
      accountHolder: null,
    });
  });

  // Real e-mail from noreply@jawwalpay.ps
  const EMAIL =
    'للمشترك: المعتز بالله عاطف ابو خاطر: تمت حركة تحويل الأموال لمبلغ ILS 1.00 بنجاح! رصيدك الحالي: ILS 802.00. رقم الحركة: 2922940429243.';

  it('parses the Jawwal Pay e-mail (transaction number, owner, no payer)', () => {
    expect(parseJawwalPayNotification(EMAIL)).toEqual({
      amount: '1.00',
      currency: 'ILS',
      senderName: null, // the name in this e-mail is the wallet owner
      senderPhone: null,
      balanceAfter: '802.00',
      reference: '2922940429243',
      direction: 'unknown',
      accountHolder: 'المعتز بالله عاطف ابو خاطر',
    });
  });

  it('parses the e-mail as HTML with bidi marks and line breaks', () => {
    const html = `<div dir="rtl">للمشترك: المعتز بالله عاطف ابو خاطر:<br>\u200fتمت حركة تحويل الأموال لمبلغ ILS ١٥.٠٠ بنجاح!<br>رصيدك الحالي: ILS 817.00.<br>رقم الحركة: 2922940429999.</div>`;
    const parsed = parseJawwalPayNotification(html);
    expect(parsed?.amount).toBe('15.00');
    expect(parsed?.reference).toBe('2922940429999');
    expect(parsed?.balanceAfter).toBe('817.00');
    expect(parsed?.senderName).toBeNull();
  });

  it('reads a payer named with "من المشترك" as incoming', () => {
    const parsed = parseJawwalPayNotification(
      'تمت حركة استلام الأموال لمبلغ ILS 20.00 من المشترك: سامي خليل حسن بنجاح! رصيدك الحالي: ILS 100.00. رقم الحركة: 1234567890.',
    );
    expect(parsed?.direction).toBe('incoming');
    expect(parsed?.senderName).toBe('سامي خليل حسن');
  });

  it('parses amounts with thousands separators and arabic digits', () => {
    const parsed = parseJawwalPayNotification(
      'لقد استلمت حركه تحويل اموال بقيمة: ILS ١,٢٥٠.٥٠ من احمد محمد . الرصيد الحالي: ILS 2,000.00 .المرجع :(١٢٣٤٥٦٧٨٩)',
    );
    expect(parsed?.amount).toBe('1250.50');
    expect(parsed?.reference).toBe('123456789');
    expect(parsed?.senderName).toBe('احمد محمد');
  });

  it('detects a phone number as sender', () => {
    const parsed = parseJawwalPayNotification(
      'لقد استلمت حركه تحويل اموال بقيمة: ILS 50.00 من 0599123456 . الرصيد الحالي: ILS 100.00 .المرجع :(555666777)',
    );
    expect(parsed?.senderPhone).toBe('0599123456');
    expect(parsed?.senderName).toBeNull();
  });

  it('parses HTML bodies', () => {
    const html = `<html><body><p>لقد استلمت حركه تحويل اموال بقيمة: ILS&nbsp;30.00 من <b>سامي خليل</b> .</p><p>الرصيد الحالي: ILS 60.00 .المرجع :(99887766)</p></body></html>`;
    const parsed = parseJawwalPayNotification(html);
    expect(parsed?.amount).toBe('30.00');
    expect(parsed?.senderName).toBe('سامي خليل');
    expect(parsed?.reference).toBe('99887766');
  });

  it('flags outgoing transfers and ignores unrelated mails', () => {
    const outgoing = parseJawwalPayNotification(
      'لقد قمت بتحويل مبلغ بقيمة: ILS 20.00 الى احمد . المرجع :(123456789)',
    );
    expect(outgoing?.direction).toBe('outgoing');
    expect(outgoing?.senderName).toBeNull();
    expect(parseJawwalPayNotification('Your weekly newsletter')).toBeNull();
    expect(
      parseJawwalPayNotification('لقد استلمت حركه تحويل اموال بدون مرجع'),
    ).toBeNull();
  });
});

describe('name matching', () => {
  it('normalises arabic spelling variants', () => {
    expect(normalizeName('المُعتز بالله أبو خاطر')).toBe(
      'المعتز بالله ابو خاطر',
    );
    expect(normalizeName('  Mohammed   Ali ')).toBe('mohammed ali');
  });

  it('matches partial and variant spellings of the same person', () => {
    const sender = 'المعتز بالله عاطف ابو خاطر';
    expect(namesMatch('معتز ابو خاطر', sender)).toBe(true);
    expect(namesMatch('المعتز بالله', sender)).toBe(true);
    expect(namesMatch('معتز أبو خاطر', sender)).toBe(true);
    expect(namesMatch(sender, sender)).toBe(true);
    expect(namesMatch('عبدالله ابو خاطر', 'عبد الله ابو خاطر')).toBe(true);
  });

  it('rejects different people and single common names', () => {
    const sender = 'المعتز بالله عاطف ابو خاطر';
    expect(namesMatch('محمد', sender)).toBe(false);
    expect(namesMatch('محمد احمد', sender)).toBe(false);
    expect(namesMatch('', sender)).toBe(false);
    expect(namesMatch('احمد ابو خاطر', 'محمد ابو سالم')).toBe(false);
  });
});

describe('phone matching', () => {
  it('normalises country prefixes', () => {
    expect(normalizePhone('+970 599 123 456')).toBe('599123456');
    expect(normalizePhone('0599123456')).toBe('599123456');
    expect(phonesMatch('972599123456', '0599-123-456')).toBe(true);
    expect(phonesMatch('0599123456', '0598123456')).toBe(false);
  });
});
