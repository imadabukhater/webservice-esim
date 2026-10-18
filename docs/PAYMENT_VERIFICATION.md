# التحقق التلقائي من الدفع عبر جوال باي (Jawwal Pay)

هذه الوثيقة تشرح كيف يبيع الموقع الخطوط/الـ eSIM **تلقائيًا** بدون تدخل يدوي:
الزبون يحوّل المبلغ عبر محفظة جوال باي، إشعار التحويل يصل إلى بريد Gmail الخاص بك،
النظام يقرأ الإشعار ويطابقه مع طلب الزبون، ثم يُفعّل الطلب ويرسل الـ eSIM فورًا.

## 1. كيف يعمل التدفق

```
الزبون                         الخادم (API)                         Gmail / جوال باي
──────                         ────────────                         ────────────────
POST /api/orders  ───────────▶  طلب جديد (payment_status = pending)
GET  /api/payments/instructions ▶ رقم المحفظة + العملة + الخطوات
(يحوّل المبلغ من جوال باي) ────────────────────────────────────────▶ إشعار يصل إلى Gmail:
                                                                      "لقد استلمت حركه تحويل اموال
                                                                       بقيمة: ILS 1.00 من <الاسم> ...
                                                                       المرجع :(2922922584908)"
POST /api/payments/claims ───▶  يسجّل: "دفعت الطلب X من محفظة
 {order_id, sender_name |         الشخص Y / بالمرجع Z"
  sender_phone | reference}
                                المطابقة التلقائية:
                                • الخادم يسحب الإشعارات من Gmail كل دقيقة (IMAP)
                                • يحفظ كل تحويل في جدول WalletTransaction (المرجع فريد)
                                • يبحث عن تحويل بنفس المبلغ والعملة خلال آخر 72 ساعة
                                  ويطابق الاسم / الرقم / المرجع
                                • عند التطابق: payment_status = completed،
                                  يُحجز eSIM متاح ويُرسل الـ QR إلى بريد الزبون
GET /api/payments/claims/order/:id ▶ الحالة: pending | matched | already_paid | ambiguous
```

لا يهم الترتيب: إن أرسل الزبون بياناته **قبل** وصول الإشعار يبقى الطلب `pending`
ويُفعَّل تلقائيًا لحظة وصول الإشعار. وإن وصل الإشعار **أولًا** يُفعَّل الطلب فور إدخال الزبون للبيانات.

## 2. قواعد المطابقة والأمان

| القاعدة | التفاصيل |
|---|---|
| المبلغ | يجب أن يساوي مبلغ الطلب (أو أكبر منه إذا `PAYMENT_ALLOW_OVERPAYMENT=true`). |
| العملة | عملة التحويل = عملة الطلب (`PAYMENT_CURRENCY`، افتراضيًا ILS). |
| المرجع | أقوى طريقة: رقم المرجع من وصل جوال باي يطابق تحويلًا واحدًا فقط. |
| الاسم | مطابقة متسامحة مع اختلافات الإملاء العربي (أ/ا، ة/ه، ى/ي، التشكيل، "ال")، لكن يلزم تطابق كلمتين على الأقل، لذلك اسم من كلمة واحدة مرفوض. |
| رقم الهاتف | يُقارن بآخر 9 أرقام (0599… = +970599… = 972599…). |
| النافذة الزمنية | فقط التحويلات خلال آخر `PAYMENT_MATCH_WINDOW_HOURS` ساعة. |
| التكرار | كل مرجع يُحفظ مرة واحدة؛ لا يمكن استخدام تحويل واحد لطلبين (حجز ذرّي في قاعدة البيانات). |
| الالتباس | إذا طابق الاسم أكثر من تحويل، تُطلب من الزبون إدخال رقم المرجع (`ambiguous`). |
| محاولات | بعد `PAYMENT_MAX_CLAIM_ATTEMPTS` محاولة لنفس الطلب يُرجع 429 ويجب التواصل مع الدعم. |

## 3. إعداد Gmail (قراءة الإشعارات عبر IMAP)

1. فعّل **التحقق بخطوتين** على حساب Google.
2. أنشئ **App password**: Google Account → Security → 2-Step Verification → App passwords.
3. تأكد أن IMAP مفعّل في Gmail: Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP.
4. اضبط المتغيرات:

```env
PAYMENT_MAIL_ENABLED=true
PAYMENT_MAIL_USER=yourshop@gmail.com
PAYMENT_MAIL_PASS=xxxx xxxx xxxx xxxx   # الـ App password
PAYMENT_MAIL_FROM_FILTER=                # اختياري: جزء من عنوان مرسل الإشعار
PAYMENT_MAIL_POLL_INTERVAL_SECONDS=60
```

الخادم يقرأ الرسائل **غير المقروءة** فقط، يحلّلها، ويضع عليها علامة "مقروء" بعد المعالجة.
الرسائل التي ليست إشعار استلام أموال تُتجاهل ولا تُغيَّر.

> لو كان إشعار جوال باي يصل كرسالة SMS بدل الإيميل، يمكن استخدام أي تطبيق "SMS forwarder"
> يرسل نص الرسالة إلى الـ webhook في القسم التالي.

## 4. بديل بدون IMAP: Webhook

```
POST /api/payments/notifications
Header: x-payment-secret: <PAYMENT_WEBHOOK_SECRET>
Body:   { "text": "لقد استلمت حركه تحويل اموال بقيمة: ILS 1.00 من ... المرجع :(2922922584908)" }
```

مثال Google Apps Script يُشغَّل كل دقيقة ويدفع الرسائل الجديدة إلى الـ webhook:

```javascript
function forwardJawwalPay() {
  const threads = GmailApp.search('is:unread "استلمت حركه تحويل"', 0, 20);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (!msg.isUnread()) continue;
      UrlFetchApp.fetch('https://YOUR-API/api/payments/notifications', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-payment-secret': 'PAYMENT_WEBHOOK_SECRET' },
        payload: JSON.stringify({ text: msg.getPlainBody(), received_at: msg.getDate().toISOString() }),
        muteHttpExceptions: true,
      });
      msg.markRead();
    }
  }
}
```

## 5. واجهات الـ API

| Method | Path | من | الوصف |
|---|---|---|---|
| GET | `/api/payments/instructions` | زبون | رقم المحفظة، العملة، خطوات الدفع |
| POST | `/api/payments/claims` | زبون | `{order_id, sender_name?, sender_phone?, reference?}` → `matched / pending / ambiguous / already_paid` |
| GET | `/api/payments/claims/order/:orderId` | زبون | حالة طلب التحقق (للاستعلام الدوري من الواجهة) |
| POST | `/api/payments/notifications` | webhook | إدخال نص إشعار (يتطلب `x-payment-secret`) |
| GET | `/api/payments/transactions?status=` | أدمن | كل التحويلات المستلمة (`unmatched / matched / ignored`) |
| POST | `/api/payments/transactions` | أدمن | لصق نص إشعار يدويًا |
| POST | `/api/payments/transactions/:id/match` | أدمن | ربط تحويل بطلب يدويًا `{order_id}` |
| POST | `/api/payments/transactions/:id/ignore` | أدمن | تجاهل تحويل غير مرتبط بطلب |
| GET | `/api/payments/claims?status=` | أدمن | كل طلبات التحقق |

## 6. ما الذي تعرضه الواجهة للزبون

1. بعد إنشاء الطلب: اعرض رقم المحفظة والمبلغ **بالضبط** من `GET /api/payments/instructions`.
2. نموذج "لقد دفعت": حقل **اسم صاحب المحفظة** (كما في جوال باي) **أو** رقم المحفظة **أو** رقم المرجع، ثم `POST /api/payments/claims`.
3. إن كانت النتيجة `pending` اعرض "بانتظار إشعار التحويل…" واستعلم عن `GET /api/payments/claims/order/:id` كل 15–30 ثانية حتى تصبح `matched`.
4. عند `matched` يكون الـ QR قد أُرسل إلى بريد الزبون ويمكن عرض تفاصيل الطلب من `GET /api/orders/:id`.

## 7. قاعدة البيانات

الـ migration `migrations/0003_rare_zaran.sql` يضيف جدولين:

- `WalletTransaction`: كل تحويل مستلم (المرجع، المبلغ، العملة، اسم/رقم المرسل، الرصيد بعد التحويل، النص الخام، المصدر، الحالة، الطلب المرتبط).
- `PaymentClaim`: ما أدخله الزبون لكل طلب (اسم/رقم/مرجع، الحالة، عدد المحاولات، التحويل المطابق).

شغّل `pnpm db:migrate` (أو `drizzle-kit migrate`) على قاعدة الإنتاج قبل النشر.

## 8. ملاحظة أمنية مهمة

النقطة `PATCH /api/orders/:id/payment-status` ما زالت **عامة** (موروثة من مرحلة الاختبار) وتسمح لأي شخص
بتحويل طلب إلى "مدفوع". قبل الاعتماد على البيع التلقائي في الإنتاج يجب تقييدها بالأدمن
(إزالة `@Public()` وإضافة `@Roles(Role.ADMIN)`) أو حذفها، لأن التفعيل التلقائي يتم الآن عبر وحدة الدفع.
