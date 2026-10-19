// test/jawwal-email.e2e-spec.ts
// The real e-mail Jawwal Pay sends (noreply@jawwalpay.ps):
//   "للمشترك: <wallet owner>: تمت حركة تحويل الأموال لمبلغ ILS 1.00 بنجاح!
//    رصيدك الحالي: ILS 802.00. رقم الحركة: 2922940429243."
// It names the wallet OWNER (not the payer) and does not say whether money
// came in or went out.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { loginAdmin, loginCustomer } from './helpers/login';

const OWNER = 'المعتز بالله عاطف ابو خاطر';
const email = (amount: number, balance: string, reference: string) =>
  `للمشترك: ${OWNER}: تمت حركة تحويل الأموال لمبلغ ILS ${amount}.00 بنجاح! رصيدك الحالي: ILS ${balance}. رقم الحركة: ${reference}.`;

describe('Jawwal Pay e-mail notifications', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  const stamp = Date.now();
  const ref = (n: number) => `29${String(stamp).slice(-9)}${n}`;

  const api = () => request(app.getHttpServer());
  const admin = (url: string, body: object) =>
    api().post(url).set('Authorization', `Bearer ${adminToken}`).send(body);
  const customer = (method: 'get' | 'post', url: string, body?: object) =>
    api()
      [method](url)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(body);
  const webhook = (text: string) =>
    api()
      .post('/api/payments/notifications')
      .set('x-payment-secret', 'test-webhook-secret')
      .send({ text });

  beforeAll(async () => {
    app = await createApp();
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('buying with the transaction number from the e-mail', () => {
    let orderId: number;
    let amount: number;
    const reference = ref(1);

    beforeAll(async () => {
      // Own provider + stock so no other test competes for the eSIM
      const provider = await admin('/api/providers', {
        name: `WeCom e-mail test ${stamp}`,
        qr_price: 10,
      });
      await admin('/api/esims', {
        provider_id: provider.body.provider_id,
        phone_number: `+97056${String(stamp).slice(-7)}`,
        iccid: `8997${stamp}9`,
        qr_code: `LPA:1$smdp.example$MAIL-${stamp}`,
      });
      const synced = await admin('/api/plans/sync', {
        provider_id: provider.body.provider_id,
        plans: [
          {
            plan_name: 'WeCom 10GB',
            data_amount_gb: 10,
            validity_days: 30,
            price: 60,
          },
        ],
      });
      const order = await customer('post', '/api/orders', {
        plan_id: synced.body.plans[0].plan_id,
      });
      expect(order.statusCode).toBe(201);
      orderId = order.body.esim_purchase_id;
      amount = order.body.amount;
      expect(amount).toBe(70);
    });

    it('stores the e-mail transfer as a payment waiting for its customer', async () => {
      const response = await webhook(email(amount, '5870.00', reference));
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('created');
      expect(response.body.transaction.reference).toBe(reference);
      expect(response.body.transaction.status).toBe('unmatched');
      // The name in the e-mail is the wallet owner, never stored as payer
      expect(response.body.transaction.sender_name).toBeUndefined();
    });

    it("does not accept the wallet owner's name as proof of payment", async () => {
      const response = await customer('post', '/api/payments/claims', {
        order_id: orderId,
        sender_name: OWNER,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('pending');
    });

    it('completes the purchase with the transaction number and shows the code', async () => {
      const response = await customer('post', '/api/payments/claims', {
        order_id: orderId,
        reference,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('matched');
      expect(response.body.esim.qr_code).toBe(
        `LPA:1$smdp.example$MAIL-${stamp}`,
      );

      const qr = await customer('get', `/api/orders/${orderId}/qr`);
      expect(qr.body.qr_image).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('direction from the wallet balance (generic e-mail)', () => {
    // Dated in the past so they never mix with other tests' transfers
    const at = (hour: number) =>
      `2020-01-01T${String(hour).padStart(2, '0')}:00:00Z`;
    const post = (text: string, hour: number) =>
      admin('/api/payments/transactions', { text, received_at: at(hour) });

    it('balance went down: outgoing transfer, kept but never used as payment', async () => {
      const start = await post(
        `لقد استلمت حركه تحويل اموال بقيمة: ILS 10.00 من فحص السلسلة الاول . الرصيد الحالي: ILS 500.00 .المرجع :(${ref(2)})`,
        10,
      );
      expect(start.body.status).toBe('created');

      const out = await post(email(20, '480.00', ref(3)), 11);
      expect(out.statusCode).toBe(201);
      expect(out.body.status).toBe('ignored');
      expect(out.body.transaction.status).toBe('ignored');
    });

    it('balance went up: incoming transfer', async () => {
      const response = await post(email(30, '510.00', ref(4)), 12);
      expect(response.body.status).toBe('created');
      expect(response.body.transaction.status).toBe('unmatched');
    });
  });
});
