// test/payment.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

const WEBHOOK_SECRET = 'test-webhook-secret'; // see .env.test

/** Build a Jawwal Pay notification exactly like the one Gmail receives. */
const notification = (amount: string, sender: string, reference: string) =>
  `لقد استلمت حركه تحويل اموال بقيمة: ILS ${amount} من ${sender} . الرصيد الحالي: ILS 999.00 .المرجع :(${reference})`;

let refCounter = 0;
const uniqueReference = () =>
  `${Date.now()}${String(++refCounter).padStart(3, '0')}`;

describe('Payments (Jawwal Pay automatic verification)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let ids: ReturnType<typeof getSeededIds>;

  beforeAll(async () => {
    app = await createApp();
    ids = getSeededIds();
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createOrder(planId: number) {
    const response = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ plan_id: planId });
    expect(response.statusCode).toBe(201);
    return response.body as {
      esim_purchase_id: number;
      amount: string;
      currency: string;
    };
  }

  const claim = (body: Record<string, unknown>, token = customerToken) =>
    request(app.getHttpServer())
      .post('/api/payments/claims')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const webhook = (text: string, secret: string | null = WEBHOOK_SECRET) => {
    const req = request(app.getHttpServer()).post(
      '/api/payments/notifications',
    );
    if (secret !== null) req.set('x-payment-secret', secret);
    return req.send({ text });
  };

  describe('GET /api/payments/instructions', () => {
    it('returns the wallet details to the customer', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/payments/instructions')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.method).toBe('jawwal_pay');
      expect(response.body.currency).toBe('ILS');
      expect(response.body.wallet_number).toBe('0599000000');
      expect(Array.isArray(response.body.steps)).toBe(true);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/payments/instructions',
      );
      expect(response.statusCode).toBe(401);
    });
  });

  describe('claim first, notification later (auto-match on arrival)', () => {
    let order: { esim_purchase_id: number; amount: string };
    const reference = uniqueReference();

    beforeAll(async () => {
      order = await createOrder(ids.plans[2]);
      expect(order).toBeDefined();
    });

    it('new orders are priced in the wallet currency', () => {
      expect((order as { currency?: string }).currency).toBe('ILS');
    });

    it('keeps the claim pending while no transfer was received', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        sender_name: 'معتز ابو خاطر',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('pending');
      expect(response.body.claim.attempts).toBe(1);
      expect(response.body.order_payment_status).toBe('pending');
    });

    it('rejects the webhook without the shared secret', async () => {
      expect((await webhook('x', null)).statusCode).toBe(403);
      expect((await webhook('x', 'wrong')).statusCode).toBe(403);
    });

    it('completes the order when the matching notification arrives', async () => {
      const response = await webhook(
        notification(order.amount, 'المعتز بالله عاطف ابو خاطر', reference),
      );

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('created');
      expect(response.body.matched_order_id).toBe(order.esim_purchase_id);
      expect(response.body.transaction.status).toBe('matched');
      expect(response.body.transaction.reference).toBe(reference);
      expect(response.body.transaction.sender_name).toBe(
        'المعتز بالله عاطف ابو خاطر',
      );
    });

    it('marks the order paid and assigns an eSIM', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/orders/${order.esim_purchase_id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.payment_status).toBe('completed');
      expect(response.body.purchase_status).toBe('code_sent');
      expect(response.body.payment_method).toBe('jawwal_pay');
      expect(response.body.payment_reference).toBe(reference);
      expect(response.body.esim_id).toBeDefined();
    });

    it('reports the claim as matched', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/payments/claims/order/${order.esim_purchase_id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('matched');
      expect(response.body.claim.matched_transaction_id).toBeDefined();
    });

    it('ignores the same notification a second time', async () => {
      const response = await webhook(
        notification(order.amount, 'المعتز بالله عاطف ابو خاطر', reference),
      );
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('duplicate');
      expect(response.body.matched_order_id).toBe(order.esim_purchase_id);
    });

    it('ignores mails that are not incoming transfers', async () => {
      const response = await webhook('Your weekly newsletter');
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('ignored');
    });
  });

  describe('notification first, claim later (match on claim)', () => {
    let order: { esim_purchase_id: number; amount: string };
    const reference = uniqueReference();

    beforeAll(async () => {
      order = await createOrder(ids.plans[3]);
    });

    it('stores the transfer as unmatched', async () => {
      const response = await webhook(
        notification(order.amount, 'سامي خليل حسن', reference),
      );
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('created');
      expect(response.body.matched_order_id).toBeUndefined();
      expect(response.body.transaction.status).toBe('unmatched');
    });

    it('keeps the claim pending for a wrong sender name', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        sender_name: 'احمد محمود',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('pending');
    });

    it('completes the order immediately with the reference number', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        reference: `(${reference})`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('matched');
      expect(response.body.order_payment_status).toBe('completed');
      expect(response.body.claim.attempts).toBe(2);
      expect(response.body.esim.qr_code).toBeDefined();
    });

    it('reports already paid on a further claim', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        reference,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('already_paid');
    });
  });

  describe('validation and access control', () => {
    let order: { esim_purchase_id: number };

    beforeAll(async () => {
      order = await createOrder(ids.plans[0]);
    });

    it('requires a name, phone or reference', async () => {
      const response = await claim({ order_id: order.esim_purchase_id });
      expect(response.statusCode).toBe(400);
    });

    it('rejects a single-word sender name', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        sender_name: 'محمد',
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects unknown fields', async () => {
      const response = await claim({
        order_id: order.esim_purchase_id,
        reference: '123456',
        hacker: true,
      });
      expect(response.statusCode).toBe(400);
    });

    it("hides other customers' orders", async () => {
      // ids.orders[1] belongs to customer2
      const response = await claim({
        order_id: ids.orders[1],
        reference: '123456789',
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for a non-existent order', async () => {
      const response = await claim({ order_id: 999999, reference: '123456' });
      expect(response.statusCode).toBe(404);
    });

    it('does not let admins submit claims', async () => {
      const response = await claim(
        { order_id: order.esim_purchase_id, reference: '123456' },
        adminToken,
      );
      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/payments/claims')
        .send({ order_id: order.esim_purchase_id, reference: '123456' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('admin tools', () => {
    it('lists transactions for admins only', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/payments/transactions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const forbidden = await request(app.getHttpServer())
        .get('/api/payments/transactions')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(forbidden.statusCode).toBe(403);
    });

    it('filters transactions by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/payments/transactions?status=matched')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.statusCode).toBe(200);
      for (const t of response.body) expect(t.status).toBe('matched');
    });

    it('registers a pasted notification and matches it manually', async () => {
      const order = await createOrder(ids.plans[4]);
      const reference = uniqueReference();

      const created = await request(app.getHttpServer())
        .post('/api/payments/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: notification(order.amount, 'زبون مجهول', reference) });
      expect(created.statusCode).toBe(201);
      expect(created.body.status).toBe('created');
      expect(created.body.transaction.source).toBe('manual');
      const transactionId = created.body.transaction.wallet_transaction_id;

      const matched = await request(app.getHttpServer())
        .post(`/api/payments/transactions/${transactionId}/match`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order_id: order.esim_purchase_id });
      expect(matched.statusCode).toBe(200);
      expect(matched.body.status).toBe('matched');
      expect(matched.body.matched_order_id).toBe(order.esim_purchase_id);

      const orderResponse = await request(app.getHttpServer())
        .get(`/api/orders/${order.esim_purchase_id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(orderResponse.body.payment_status).toBe('completed');

      const ignore = await request(app.getHttpServer())
        .post(`/api/payments/transactions/${transactionId}/ignore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ignore.statusCode).toBe(400);
    });

    it('ignores an unrelated transfer', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/payments/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: notification('0.50', 'شخص اخر', uniqueReference()) });
      expect(created.statusCode).toBe(201);

      const ignore = await request(app.getHttpServer())
        .post(
          `/api/payments/transactions/${created.body.transaction.wallet_transaction_id}/ignore`,
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(ignore.statusCode).toBe(200);
      expect(ignore.body.status).toBe('ignored');
    });

    it('lists claims for admins', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/payments/claims')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.statusCode).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('forbids manual registration for customers', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/payments/transactions')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ text: notification('1.00', 'x y', uniqueReference()) });
      expect(response.statusCode).toBe(403);
    });
  });
});
