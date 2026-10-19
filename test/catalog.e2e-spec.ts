// test/catalog.e2e-spec.ts
// Provider catalog: sync without duplicates, reset, visibility, QR price per
// provider, renewal price per plan / provider and QR display per plan.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { loginAdmin } from './helpers/login';

describe('Catalog: providers, plans and store pricing', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let customerId: number;
  let providerId: number;
  const stamp = Date.now();

  const api = () => request(app.getHttpServer());
  const asAdmin = (
    method: 'get' | 'post' | 'put' | 'patch',
    url: string,
    body?: object,
  ) =>
    api()[method](url).set('Authorization', `Bearer ${adminToken}`).send(body);
  const asCustomer = (method: 'get' | 'post', url: string, body?: object) =>
    api()
      [method](url)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(body);

  const catalog = (plans: object[], remove_missing?: boolean) =>
    asAdmin('post', '/api/plans/sync', {
      provider_id: providerId,
      plans,
      ...(remove_missing === undefined ? {} : { remove_missing }),
    });

  const addEsim = (n: number) =>
    asAdmin('post', '/api/esims', {
      provider_id: providerId,
      phone_number: `+97059${String(stamp).slice(-6)}${n}`,
      iccid: `8997${stamp}${n}`,
      qr_code: `LPA:1$smdp.example$CATALOG-${stamp}-${n}`,
    });

  const providerPlans = async () =>
    (await asAdmin('get', `/api/plans/manage/all?provider_id=${providerId}`))
      .body as Array<{
      plan_id: number;
      plan_name: string;
      is_active: boolean;
      is_visible: boolean;
      show_qr: boolean;
      pricing: { new_esim_total: number; renewal_price: number };
    }>;

  const planNamed = async (name: string) =>
    (await providerPlans()).find((p) => p.plan_name === name)!;

  beforeAll(async () => {
    app = await createApp();
    adminToken = await loginAdmin(app);

    // A fresh customer, so balance changes never race other test files
    const registered = await api()
      .post('/api/users')
      .send({
        email: `catalog-${stamp}@test.com`,
        password: 'CatalogPass123!',
        full_name: 'Catalog Customer',
      });
    expect(registered.statusCode).toBe(201);
    customerToken = registered.body.accessToken;
    customerId = registered.body.user.user_id;

    const provider = await asAdmin('post', '/api/providers', {
      name: `Lyan eSIM ${stamp}`,
      qr_price: 10,
      renewal_price: 15,
    });
    expect(provider.statusCode).toBe(201);
    providerId = provider.body.provider_id;
    expect(provider.body.qr_price).toBe(10);
    expect(provider.body.is_visible).toBe(true);

    for (const n of [1, 2, 3]) {
      const esim = await addEsim(n);
      expect(esim.statusCode).toBe(201);
      expect(esim.body.provider_id).toBe(providerId);
    }

    const credit = await asAdmin(
      'post',
      `/api/payments/balances/${customerId}/adjust`,
      { amount: 1000, note: 'Catalog test credit' },
    );
    expect(credit.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('catalog sync', () => {
    it('creates the provider plans', async () => {
      const response = await catalog([
        {
          plan_name: '10GB - 30 days',
          data_amount_gb: 10,
          validity_days: 30,
          price: 30,
        },
        {
          plan_name: '50GB - 30 days',
          data_amount_gb: 50,
          validity_days: 30,
          price: 50,
          renewal_price: 40,
        },
        {
          plan_name: 'Team activated 5GB',
          data_amount_gb: 5,
          validity_days: 7,
          price: 20,
          show_qr: false,
        },
      ]);
      expect(response.statusCode).toBe(200);
      expect(response.body.created).toBe(3);
      expect(response.body.plans).toHaveLength(3);
    });

    it('rejects a catalog that lists the same plan twice', async () => {
      const response = await catalog([
        { plan_name: 'Dup 1GB', data_amount_gb: 1, validity_days: 7, price: 5 },
        {
          plan_name: '  dup   1gb ',
          data_amount_gb: 1,
          validity_days: 7,
          price: 5,
        },
      ]);
      expect(response.statusCode).toBe(400);
    });

    it('matches plans by name on re-sync instead of duplicating them', async () => {
      const response = await catalog([
        {
          plan_name: '  10gb  -  30 DAYS ',
          data_amount_gb: 12,
          validity_days: 30,
          price: 30,
        },
        {
          plan_name: '50GB - 30 days',
          data_amount_gb: 50,
          validity_days: 30,
          price: 50,
        },
        {
          plan_name: 'Team activated 5GB',
          data_amount_gb: 5,
          validity_days: 7,
          price: 20,
        },
        {
          plan_name: 'Weekend 2GB',
          data_amount_gb: 2,
          validity_days: 3,
          price: 8,
        },
      ]);
      expect(response.statusCode).toBe(200);
      expect(response.body.created).toBe(1);
      expect(response.body.updated).toBe(3);
      expect(response.body.plans).toHaveLength(4);

      const plan10 = response.body.plans.find(
        (p: { data_amount_gb: number }) => p.data_amount_gb === 12,
      );
      expect(plan10).toBeDefined();
      // Admin settings not in the catalog are kept
      const team = await planNamed('Team activated 5GB');
      expect(team.show_qr).toBe(false);
      const big = await planNamed('50GB - 30 days');
      expect(big.pricing.renewal_price).toBe(40);
    });

    it('removes plans that are no longer in the catalog', async () => {
      const response = await catalog([
        {
          plan_name: '10GB - 30 days',
          data_amount_gb: 12,
          validity_days: 30,
          price: 30,
        },
        {
          plan_name: '50GB - 30 days',
          data_amount_gb: 50,
          validity_days: 30,
          price: 50,
        },
        {
          plan_name: 'Team activated 5GB',
          data_amount_gb: 5,
          validity_days: 7,
          price: 20,
        },
      ]);
      expect(response.body.deleted).toBe(1);
      expect(await planNamed('Weekend 2GB')).toBeUndefined();
    });

    it('refuses a duplicate plan name for the same provider', async () => {
      const response = await asAdmin('post', '/api/plans', {
        provider_id: providerId,
        plan_name: '10gb - 30 DAYS',
        data_amount_gb: 1,
        call_minutes: 0,
        sms_count: 0,
        validity_days: 30,
        price: 30,
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe('store visibility and pricing', () => {
    it('shows plan price + provider QR price and the renewal price', async () => {
      const response = await api().get('/api/plans');
      const plan = response.body.find(
        (p: { provider_id: number; plan_name: string }) =>
          p.provider_id === providerId && p.plan_name === '10GB - 30 days',
      );
      expect(plan.pricing).toEqual({
        plan_price: 30,
        qr_price: 10,
        new_esim_total: 40,
        renewal_price: 15, // provider default, the plan has none
      });
      expect(plan.provider.qr_price).toBe(10);
    });

    it('hides a plan from the store', async () => {
      const plan = await planNamed('50GB - 30 days');
      await asAdmin('patch', `/api/plans/${plan.plan_id}`, { is_visible: false });

      expect((await api().get(`/api/plans/${plan.plan_id}`)).statusCode).toBe(
        404,
      );
      const order = await asCustomer('post', '/api/orders', {
        plan_id: plan.plan_id,
      });
      expect(order.statusCode).toBe(400);
      const admin = await planNamed('50GB - 30 days');
      expect(admin.is_visible).toBe(false);

      await asAdmin('patch', `/api/plans/${plan.plan_id}`, { is_visible: true });
      expect((await api().get(`/api/plans/${plan.plan_id}`)).statusCode).toBe(
        200,
      );
    });

    it('hides a whole provider from the store', async () => {
      await asAdmin('put', `/api/providers/${providerId}`, {
        is_visible: false,
      });

      const providers = await api().get('/api/providers');
      expect(
        providers.body.some(
          (p: { provider_id: number }) => p.provider_id === providerId,
        ),
      ).toBe(false);
      const plans = await api().get('/api/plans');
      expect(
        plans.body.some(
          (p: { provider_id: number }) => p.provider_id === providerId,
        ),
      ).toBe(false);
      const all = await asAdmin('get', '/api/providers/manage/all');
      expect(
        all.body.some(
          (p: { provider_id: number }) => p.provider_id === providerId,
        ),
      ).toBe(true);

      await asAdmin('put', `/api/providers/${providerId}`, {
        is_visible: true,
      });
    });
  });

  describe('buying, QR display and renewals', () => {
    let lineOrderId: number;

    it('charges plan price + QR price and shows the QR at once', async () => {
      const plan = await planNamed('10GB - 30 days');
      const order = await asCustomer('post', '/api/orders', {
        plan_id: plan.plan_id,
      });
      expect(order.statusCode).toBe(201);
      expect(order.body.amount).toBe(40);
      expect(order.body.qr_fee).toBe(10);

      const paid = await asCustomer(
        'post',
        `/api/payments/orders/${order.body.esim_purchase_id}/pay-with-balance`,
      );
      expect(paid.statusCode).toBe(200);
      expect(paid.body.order.qr_visible).toBe(true);
      expect(paid.body.order.esim.qr_code).toMatch(
        /^LPA:1\$smdp\.example\$CATALOG-/,
      );
      lineOrderId = order.body.esim_purchase_id;
    });

    it('returns the QR as an image', async () => {
      const response = await asCustomer('get', `/api/orders/${lineOrderId}/qr`);
      expect(response.statusCode).toBe(200);
      expect(response.body.qr_image).toMatch(/^data:image\/png;base64,/);
      expect(response.body.qr_code).toMatch(/^LPA:1/);
    });

    it('renews at the provider renewal price, then at the plan renewal price', async () => {
      const first = await asCustomer(
        'post',
        `/api/orders/${lineOrderId}/renew`,
        {
          type: 'extension',
        },
      );
      expect(first.statusCode).toBe(201);
      expect(first.body.amount).toBe(15);
      expect(first.body.qr_fee).toBe(0);
      await asCustomer(
        'post',
        `/api/payments/orders/${first.body.esim_purchase_id}/pay-with-balance`,
      );

      const plan = await planNamed('10GB - 30 days');
      await asAdmin('patch', `/api/plans/${plan.plan_id}`, { renewal_price: 12 });
      const second = await asCustomer(
        'post',
        `/api/orders/${lineOrderId}/renew`,
        {
          type: 'renewal',
        },
      );
      expect(second.statusCode).toBe(201);
      expect(second.body.amount).toBe(12);
      await asCustomer(
        'post',
        `/api/payments/orders/${second.body.esim_purchase_id}/pay-with-balance`,
      );
    });

    it('can renew onto another plan of the same provider', async () => {
      const big = await planNamed('50GB - 30 days');
      const response = await asCustomer(
        'post',
        `/api/orders/${lineOrderId}/renew`,
        {
          type: 'renewal',
          plan_id: big.plan_id,
        },
      );
      expect(response.statusCode).toBe(201);
      expect(response.body.plan_id).toBe(big.plan_id);
      expect(response.body.amount).toBe(40);
      const paid = await asCustomer(
        'post',
        `/api/payments/orders/${response.body.esim_purchase_id}/pay-with-balance`,
      );
      expect(paid.statusCode).toBe(200);
      const line = await asCustomer('get', `/api/orders/${lineOrderId}`);
      expect(line.body.plan_id).toBe(big.plan_id);
    });

    it('hides the QR from the customer when the plan does not show it', async () => {
      const plan = await planNamed('Team activated 5GB');
      const order = await asCustomer('post', '/api/orders', {
        plan_id: plan.plan_id,
      });
      const paid = await asCustomer(
        'post',
        `/api/payments/orders/${order.body.esim_purchase_id}/pay-with-balance`,
      );
      expect(paid.statusCode).toBe(200);
      expect(paid.body.order.qr_visible).toBe(false);
      expect(paid.body.order.esim.esim_id).toBeDefined();
      expect(paid.body.order.esim.qr_code).toBeUndefined();

      const qr = await asCustomer(
        'get',
        `/api/orders/${order.body.esim_purchase_id}/qr`,
      );
      expect(qr.statusCode).toBe(400);

      const admin = await asAdmin(
        'get',
        `/api/orders/${order.body.esim_purchase_id}`,
      );
      expect(admin.body.esim.qr_code).toMatch(/^LPA:1/);
    });
  });

  describe('reset', () => {
    it('needs the exact confirmation text', async () => {
      const response = await asAdmin('post', '/api/plans/reset', {
        confirm: 'yes',
        provider_id: providerId,
      });
      expect(response.statusCode).toBe(400);
    });

    it('deletes plans without orders, archives the rest and keeps eSIM stock', async () => {
      const before = await asAdmin('get', `/api/providers/${providerId}/esims`);
      const response = await asAdmin('post', '/api/plans/reset', {
        confirm: 'DELETE ALL PLANS',
        provider_id: providerId,
      });
      expect(response.statusCode).toBe(200);
      // '10GB' and '50GB' and 'Team activated' all have orders now
      expect(response.body.archived).toBe(3);
      expect(response.body.deleted).toBe(0);

      const plans = await api().get('/api/plans');
      expect(
        plans.body.some(
          (p: { provider_id: number }) => p.provider_id === providerId,
        ),
      ).toBe(false);
      const after = await asAdmin('get', `/api/providers/${providerId}/esims`);
      expect(after.body).toHaveLength(before.body.length);
    });

    it('brings an archived plan back when the catalog lists it again', async () => {
      const response = await catalog([
        {
          plan_name: '10GB - 30 days',
          data_amount_gb: 10,
          validity_days: 30,
          price: 35,
        },
      ]);
      expect(response.body.created).toBe(0);
      expect(response.body.updated).toBe(1);
      const plan = await planNamed('10GB - 30 days');
      expect(plan.is_active).toBe(true);
      expect(plan.is_visible).toBe(true);
    });
  });
});
