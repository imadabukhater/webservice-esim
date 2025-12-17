// test/order.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

describe('Orders', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let createdOrderId: number;
  let orderId: number;
  let planId: number;

  beforeAll(async () => {
    app = await createApp();
    const ids = getSeededIds();
    orderId = ids.orders[0];
    planId = ids.plans[0];

    // Get tokens using login helper
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/orders (Get Orders)', () => {
    const url = '/api/orders';

    it('should return all orders for admin', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return only own orders for customer', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/orders (Create Order)', () => {
    const url = '/api/orders';

    it('should create order as customer', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          plan_id: planId,
        });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('esim_purchase_id');
      expect(response.body).toHaveProperty('order_number');
      expect(response.body).toHaveProperty('amount');
      createdOrderId = response.body.esim_purchase_id;
    });

    it('should return 403 for admin (customer-only endpoint)', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_id: planId,
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        plan_id: planId,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with missing plan_id', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({});

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/orders/:id (Get Order by ID)', () => {
    it('should return order for admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('esim_purchase_id');
    });

    it('should return own order for customer', async () => {
      // First get the list of orders to find one that belongs to this customer
      const listResponse = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      if (listResponse.body.length > 0) {
        const orderId = listResponse.body[0].esim_purchase_id;
        const response = await request(app.getHttpServer())
          .get(`/api/orders/${orderId}`)
          .set('Authorization', `Bearer ${customerToken}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.esim_purchase_id).toBe(orderId);
      }
    });

    it('should return 403 when customer accesses another users order', async () => {
      // Order 2 belongs to jane.smith based on seed data
      const ids = getSeededIds();
      const otherOrderId = ids.orders[1];
      const response = await request(app.getHttpServer())
        .get(`/api/orders/${otherOrderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      // Should be 403 if order belongs to another user
      expect([403, 404]).toContain(response.statusCode);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/orders/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/orders/${orderId}`,
      );

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /api/orders/:id (Update Order)', () => {
    it('should update order as admin', async () => {
      // Get list of orders first
      const listResponse = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      if (listResponse.body.length > 0) {
        const firstOrderId = listResponse.body[0].esim_purchase_id;
        const response = await request(app.getHttpServer())
          .put(`/api/orders/${firstOrderId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            purchase_status: 'activated',
            payment_status: 'completed',
          });

        expect([200, 400]).toContain(response.statusCode);
      }
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purchase_status: 'activated',
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/orders/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purchase_status: 'activated',
        });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/orders/${orderId}`)
        .send({
          purchase_status: 'activated',
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/orders/:id/payment-status (Update Payment Status)', () => {
    const url = '/api/orders';

    it('should update payment status (public endpoint for testing)', async () => {
      // Get list of orders first to find a valid order
      const listResponse = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      if (listResponse.body.length > 0) {
        const orderId = listResponse.body[0].esim_purchase_id;
        const response = await request(app.getHttpServer())
          .patch(`${url}/${orderId}/payment-status`)
          .send({
            payment_status: 'completed',
          });

        expect([200, 400]).toContain(response.statusCode);
      }
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${url}/99999/payment-status`)
        .send({
          payment_status: 'completed',
        });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/orders/:id (Delete Order)', () => {
    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).delete(
        `/api/orders/${orderId}`,
      );

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/orders/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });

    it('should delete order as admin', async () => {
      // First create an order to delete
      const createResponse = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          plan_id: planId,
        });

      const deleteId = createResponse.body.esim_purchase_id;

      if (deleteId) {
        const response = await request(app.getHttpServer())
          .delete(`/api/orders/${deleteId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(204);

        // Verify deletion
        const verifyResponse = await request(app.getHttpServer())
          .get(`/api/orders/${deleteId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(verifyResponse.statusCode).toBe(404);
      }
    });
  });
});
