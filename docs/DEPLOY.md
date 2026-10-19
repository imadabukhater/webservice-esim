# نشر التحديثات على خادمك (Google Cloud)

موقعك يعمل على خادم Google Cloud خلف العنوان `https://34-56-162-217.sslip.io`.
جلسات المساعد السحابية لا تملك وصولًا لخادمك (لا SSH ولا حساب Google)، لذلك
النشر يتم **بأمر واحد تشغّله أنت على الخادم**.

## التحديث (في كل مرة)

ادخل إلى الخادم ثم:

```bash
cd ~/webservice-esim        # مجلد المشروع على الخادم (عدّله إن اختلف)
git fetch origin claude/auto-activation-payment-nweklk
git checkout claude/auto-activation-payment-nweklk -- deploy
bash deploy/update.sh
```

السكربت يقوم بكل شيء بالترتيب:

1. يسحب آخر نسخة من الفرع `claude/auto-activation-payment-nweklk`.
2. يثبّت الاعتمادات (`pnpm install`).
3. يطبّق تهجيرات قاعدة البيانات **0004 و0005** عبر
   `deploy/apply-migration.js` — آمنة لإعادة التشغيل: ما طُبّق سابقًا يُتخطى،
   وتتضمن تقريب الأسعار، دمج الرزم المكررة، ونقل مخزون الشرائح إلى الشركات.
4. يبني المشروع ويعيد تشغيله:
   - إن وجد حاوية `esims-app-backend` يبني ويشغّل عبر
     `docker-compose-backend.yml`،
   - وإلا يعيد التشغيل عبر pm2 أو systemd (خدمة باسم `esims`) أو nohup.
5. يفحص `GET /api/health` ويخبرك بالنتيجة.

خيارات: `--branch <اسم>`، `--mode docker|node`، `--no-migrate`.

> قاعدة بيانات **جديدة فارغة**؟ استخدم `pnpm db:migrate` مرة واحدة بدل الخطوة 3
> (تبني كل الجداول من الصفر)، ثم `pnpm db:seed` إن أردت كتالوج البداية.

## النشر التلقائي من GitHub (اضبطه مرة واحدة ثم انسَ الأمر)

بعد إضافة 3 أسرار في GitHub، كل تحديث على الفرع ينشر نفسه على خادمك تلقائيًا
عبر `.github/workflows/deploy-gcp.yml`:

GitHub ← المستودع `webservice-esim` ← Settings ← Secrets and variables ← Actions ← New repository secret:

| الاسم | القيمة |
|---|---|
| `GCP_SSH_HOST` | `34.56.162.217` |
| `GCP_SSH_USER` | اسم المستخدم الذي تدخل به للخادم |
| `GCP_SSH_KEY` | مفتاح SSH خاص، ومفتاحه العام مضاف للخادم (Compute Engine ← VM ← Edit ← SSH Keys) |
| `GCP_APP_DIR` | اختياري: مجلد المشروع إن لم يكن `~/webservice-esim` |

للنشر فورًا بعد إضافتها: تبويب Actions ← Deploy to Google Cloud VM ← Run workflow.
قبل إضافة الأسرار تُتخطّى الخطوة بدون أخطاء.

## أول نشر لهذه التحديثات: خطوات إضافية

1. **متغيرات البيئة** في `.env` على الخادم (القائمة الكاملة في `.env.example`):
   - `PAYMENT_WALLET_NUMBER` و`PAYMENT_WALLET_NAME`: محفظة جوال باي التي يحوّل إليها الزبائن.
   - `PAYMENT_WEBHOOK_SECRET`: سر عشوائي طويل.
   - `PAYMENT_MAIL_ENABLED=true` مع `PAYMENT_MAIL_USER` و`PAYMENT_MAIL_PASS`
     (App Password من Google) لقراءة إشعارات التحويل من Gmail تلقائيًا.
   - `EMAIL_ENABLED=true` وإعدادات SMTP لإرسال رموز QR للزبائن.
2. **الكتالوج**: إن كانت القاعدة الحالية فيها رزم تجريبية، حمّل كتالوجك الحقيقي
   عبر `POST /api/plans/sync` لكل شركة (WeCom من الوها، هوت موبايل من ليان)
   كما في `STORE_AND_CATALOG.md`، وحدّد `qr_price` لكل شركة من
   `PUT /api/providers/:id`.
3. **المخزون**: أضف رموز QR عبر `POST /api/esims` مع `provider_id`.
4. افتح `https://34-56-162-217.sslip.io/shop` وتأكد أن الرزم تظهر مباشرة.

## إن أردت أن ينشر المساعد مباشرة في المرات القادمة

من إعدادات بيئة الجلسة السحابية (قائمة البيئة في شريط العنوان ← Edit):

1. **Network access**: أضف `34-56-162-217.sslip.io` ضمن Allowed domains
   (الشرح: https://code.claude.com/docs/en/cloud-environments#network-access).
2. أضف وسيلة وصول للخادم (مثلًا مفتاح SSH كسر بيئة) — عندها يمكن تنفيذ
   `deploy/update.sh` عن بُعد نيابة عنك.
