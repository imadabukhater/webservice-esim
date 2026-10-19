// test/payment-balance.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

const WEBHOOK_SECRET = 'test-webhook-secret'; // see .env.test
const DAY_MS = 86_400_000;

const dayOf = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const todayUtc = () => new Date().toISOString().slice(0, 10);

const uniqueReference = () =>
  `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;

const notification = (amount: string, sender: string, reference: string) =>
  `لقد استلمت حركه تحويل اموال بقيمة: ILS ${amount} من ${sender} . الرصيد الحالي: ILS 999.00 .المرجع :(${reference})`;

describe('Prepaid balance, renewals and eSIM activation', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let customerId: number;
  let ids: ReturnType<typeof getSeededIds>;

  const get = (url: string, token = customerToken) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: object = {}, token = customerToken) =>
    request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const balanceOf = async () =>
    (await get('/api/payments/balance')).body.balance as number;

  const adminCredit = (amount: number, note = 'Cash top-up at the office') =>
    post(
      `/api/payments/balances/${customerId}/adjust`,
      { amount, note },
      adminToken,
    );

  beforeAll(async () => {
    app = await createApp();
    ids = getSeededIds();
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
    customerId = ids.users.customer1Id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('whole-unit prices', () => {
    it('lists plans with whole-number prices', async () => {
      const response = await request(app.getHttpServer()).get('/api/plans');
      expect(response.statusCode).toBe(200);
      for (const plan of response.body) {
        expect(Number.isInteger(plan.price)).toBe(true);
      }
    });

    it('rejects a plan price with fils', async () => {
      const response = await post(
        '/api/plans',
        {
          provider_id: ids.providers[0],
          plan_name: 'Fils test',
          data_amount_gb: 1,
          call_minutes: 0,
          sms_count: 0,
          validity_days: 7,
          price: 19.5,
        },
        adminToken,
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('buying from the prepaid balance', () => {
    const planId = () => ids.plans[0];
    let planPrice: number;
    let planValidity: number;
    let lineOrderId: number;

    beforeAll(async () => {
      const plan = (
        await request(app.getHttpServer()).get(`/api/plans/${planId()}`)
      ).body;
      planPrice = plan.price;
      planValidity = plan.validity_days;
    });

    it('admin credits the customer balance', async () => {
      const before = await balanceOf();
      const response = await adminCredit(1000);
      expect(response.statusCode).toBe(200);
      expect(response.body.balance).toBe(before + 1000);
      expect(response.body.transactions[0].kind).toBe('adjustment');
    });

    it('customers cannot change balances', async () => {
      const response = await post(
        `/api/payments/balances/${customerId}/adjust`,
        { amount: 1000, note: 'Self credit attempt' },
      );
      expect(response.statusCode).toBe(403);
    });

    it('pays a new order from balance and returns the QR code at once', async () => {
      const order = await post('/api/orders', { plan_id: planId() });
      expect(order.statusCode).toBe(201);
      expect(order.body.amount).toBe(planPrice);
      expect(order.body.currency).toBe('ILS');

      const before = await balanceOf();
      const response = await post(
        `/api/payments/orders/${order.body.esim_purchase_id}/pay-with-balance`,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body.order.payment_status).toBe('completed');
      expect(response.body.order.payment_method).toBe('balance');
      expect(response.body.order.esim.qr_code).toBeDefined();
      expect(response.body.balance).toBe(before - planPrice);
      lineOrderId = order.body.esim_purchase_id;
    });

    it('refuses to pay the same order twice', async () => {
      const response = await post(
        `/api/payments/orders/${lineOrderId}/pay-with-balance`,
      );
      expect(response.statusCode).toBe(400);
    });

    it('activates the eSIM and is idempotent', async () => {
      const first = await post(`/api/orders/${lineOrderId}/activate`);
      expect(first.statusCode).toBe(200);
      expect(first.body.purchase_status).toBe('activated');
      expect(first.body.esim.qr_code).toBeDefined();

      const second = await post(`/api/orders/${lineOrderId}/activate`);
      expect(second.statusCode).toBe(200);
      expect(second.body.purchase_status).toBe('activated');
    });

    it('records the purchase in the balance ledger', async () => {
      const response = await get('/api/payments/balance');
      const purchase = response.body.transactions.find(
        (t: { kind: string; order_id?: number }) =>
          t.kind === 'purchase' && t.order_id === lineOrderId,
      );
      expect(purchase).toBeDefined();
      expect(purchase.amount).toBe(-planPrice);
    });

    it('extension costs the plan price and moves the expiry by the validity', async () => {
      const before = (await get(`/api/orders/${lineOrderId}`)).body;

      const renewal = await post(`/api/orders/${lineOrderId}/renew`, {
        type: 'extension',
      });
      expect(renewal.statusCode).toBe(201);
      expect(renewal.body.purchase_type).toBe('extension');
      expect(renewal.body.renews_purchase_id).toBe(lineOrderId);
      expect(renewal.body.amount).toBe(planPrice);

      const paid = await post(
        `/api/payments/orders/${renewal.body.esim_purchase_id}/pay-with-balance`,
      );
      expect(paid.statusCode).toBe(200);

      const after = (await get(`/api/orders/${lineOrderId}`)).body;
      expect(
        daysBetween(dayOf(before.expiry_date), dayOf(after.expiry_date)),
      ).toBe(planValidity);
      expect(after.esim.esim_id).toBe(before.esim.esim_id);
    });

    it('renewal starts a new validity period from today', async () => {
      const renewal = await post(`/api/orders/${lineOrderId}/renew`, {
        type: 'renewal',
      });
      expect(renewal.statusCode).toBe(201);
      expect(renewal.body.purchase_type).toBe('renewal');
      expect(renewal.body.amount).toBe(planPrice);

      const paid = await post(
        `/api/payments/orders/${renewal.body.esim_purchase_id}/pay-with-balance`,
      );
      expect(paid.statusCode).toBe(200);

      const line = (await get(`/api/orders/${lineOrderId}`)).body;
      expect(daysBetween(todayUtc(), dayOf(line.expiry_date))).toBe(
        planValidity,
      );
    });

    it('allows only one renewal waiting for payment per line', async () => {
      const first = await post(`/api/orders/${lineOrderId}/renew`, {
        type: 'renewal',
      });
      expect(first.statusCode).toBe(201);

      const second = await post(`/api/orders/${lineOrderId}/renew`, {
        type: 'renewal',
      });
      expect(second.statusCode).toBe(400);

      // Clear the pending renewal so later tests start clean
      await post(
        `/api/payments/orders/${first.body.esim_purchase_id}/pay-with-balance`,
      );
    });

    it('refuses to extend a line that has already expired', async () => {
      // Seeded order 1 belongs to the customer and expired in 2025
      const response = await post(`/api/orders/${ids.orders[0]}/renew`, {
        type: 'extension',
      });
      expect(response.statusCode).toBe(400);
    });

    it('renews the expired seeded line at the plan price', async () => {
      const seeded = (await get(`/api/orders/${ids.orders[0]}`)).body;
      const plan = (
        await request(app.getHttpServer()).get(`/api/plans/${seeded.plan_id}`)
      ).body;

      const response = await post(`/api/orders/${ids.orders[0]}/renew`, {
        type: 'renewal',
      });
      expect(response.statusCode).toBe(201);
      expect(response.body.amount).toBe(plan.price);
    });

    it('refuses payment from balance when the balance is too low', async () => {
      // The previous test left a renewal of the seeded line waiting for payment
      const orders = (await get('/api/orders')).body as Array<{
        esim_purchase_id: number;
        renews_purchase_id?: number;
        payment_status: string;
      }>;
      const pending = orders.find(
        (o) =>
          o.renews_purchase_id === ids.orders[0] &&
          o.payment_status === 'pending',
      );
      expect(pending).toBeDefined();

      const balance = await balanceOf();
      await adminCredit(-balance, 'Reset balance for insufficient-funds test');

      const response = await post(
        `/api/payments/orders/${pending!.esim_purchase_id}/pay-with-balance`,
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(response.body)).toMatch(/insufficient balance/i);
      expect(await balanceOf()).toBe(0);
    });

    it('does not let an order be activated before it is paid', async () => {
      const order = await post('/api/orders', { plan_id: planId() });
      expect(order.statusCode).toBe(201);
      const response = await post(
        `/api/orders/${order.body.esim_purchase_id}/activate`,
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('prepaid top-up by transfer', () => {
    it('rejects top-ups with fils', async () => {
      const response = await post('/api/payments/topups', {
        amount: 10.5,
        sender_name: 'ليلى محمد احمد',
      });
      expect(response.statusCode).toBe(400);
    });

    it('credits the balance when the transfer arrives after the top-up', async () => {
      const before = await balanceOf();
      const topup = await post('/api/payments/topups', {
        amount: 50,
        sender_name: 'ليلى محمد احمد',
      });
      expect(topup.statusCode).toBe(200);
      expect(topup.body.status).toBe('pending');
      expect(topup.body.claim.purpose).toBe('topup');

      const received = await request(app.getHttpServer())
        .post('/api/payments/notifications')
        .set('x-payment-secret', WEBHOOK_SECRET)
        .send({
          text: notification('50.00', 'ليلى محمد احمد', uniqueReference()),
        });
      expect(received.statusCode).toBe(200);
      expect(received.body.status).toBe('created');
      expect(received.body.transaction.status).toBe('matched');

      expect(await balanceOf()).toBe(before + 50);
      const topups = await get('/api/payments/topups');
      const claim = topups.body.find(
        (t: { claim_id: number }) => t.claim_id === topup.body.claim.claim_id,
      );
      expect(claim.status).toBe('matched');
    });

    it('credits immediately when the transfer arrived before the top-up', async () => {
      const received = await request(app.getHttpServer())
        .post('/api/payments/notifications')
        .set('x-payment-secret', WEBHOOK_SECRET)
        .send({
          text: notification('30.00', 'سعيد عادل خليل', uniqueReference()),
        });
      expect(received.body.transaction.status).toBe('unmatched');

      const before = await balanceOf();
      const topup = await post('/api/payments/topups', {
        amount: 30,
        sender_name: 'سعيد عادل خليل',
      });
      expect(topup.body.status).toBe('matched');
      expect(topup.body.balance).toBe(before + 30);
    });

    it('does not credit a transfer with a different amount', async () => {
      await request(app.getHttpServer())
        .post('/api/payments/notifications')
        .set('x-payment-secret', WEBHOOK_SECRET)
        .send({
          text: notification('40.00', 'حسن ابراهيم عباس', uniqueReference()),
        });

      const before = await balanceOf();
      const topup = await post('/api/payments/topups', {
        amount: 35,
        sender_name: 'حسن ابراهيم عباس',
      });
      expect(topup.body.status).toBe('pending');
      expect(await balanceOf()).toBe(before);
    });

    it('admin sees the same balance as the customer', async () => {
      const customer = await balanceOf();
      const admin = await request(app.getHttpServer())
        .get(`/api/payments/balances/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(admin.statusCode).toBe(200);
      expect(admin.body.balance).toBe(customer);
    });
  });
});
