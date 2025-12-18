// test/plan.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

describe('Plans', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let createdPlanId: number;
  let planId: number;
  let providerId: number;

  beforeAll(async () => {
    app = await createApp();
    const ids = getSeededIds();
    planId = ids.plans[0];
    providerId = ids.providers[0];

    // Get tokens using login helper
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/plans (Get All Plans)', () => {
    const url = '/api/plans';

    it('should return all plans (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('plan_id');
      expect(response.body[0]).toHaveProperty('plan_name');
      expect(response.body[0]).toHaveProperty('price');
    });

    it('should filter plans by is_active=true', async () => {
      const response = await request(app.getHttpServer()).get(
        `${url}?is_active=true`,
      );

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((plan: { is_active: boolean }) => {
        expect(plan.is_active).toBe(true);
      });
    });

    it('should filter plans by is_active=false', async () => {
      const response = await request(app.getHttpServer()).get(
        `${url}?is_active=false`,
      );

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should include provider information', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(200);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('provider');
      }
    });
  });

  describe('GET /api/plans/:id (Get Plan by ID)', () => {
    it('should return plan by ID (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/plans/${planId}`,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('plan_id', planId);
      expect(response.body).toHaveProperty('plan_name');
      expect(response.body).toHaveProperty('data_amount_gb');
      expect(response.body).toHaveProperty('validity_days');
      expect(response.body).toHaveProperty('price');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/plans/99999',
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/plans (Create Plan)', () => {
    const url = '/api/plans';

    it('should create plan as admin', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider_id: providerId,
          plan_name: `Test Plan ${Date.now()}`,
          data_amount_gb: 10,
          call_minutes: 100,
          sms_count: 50,
          validity_days: 30,
          price: 29.99,
          description: 'Test plan description',
          is_active: true,
        });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('plan_id');
      expect(response.body.data_amount_gb).toBe(10);
      expect(response.body.validity_days).toBe(30);
      createdPlanId = response.body.plan_id;
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          provider_id: providerId,
          plan_name: 'Unauthorized Plan',
          data_amount_gb: 5,
          call_minutes: 0,
          sms_count: 0,
          validity_days: 15,
          price: 19.99,
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        provider_id: providerId,
        plan_name: 'Anonymous Plan',
        data_amount_gb: 5,
        call_minutes: 0,
        sms_count: 0,
        validity_days: 15,
        price: 19.99,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_name: 'Incomplete Plan',
        });

      expect(response.statusCode).toBe(400);
    });

    it('should return error with invalid provider_id', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider_id: 99999,
          plan_name: 'Invalid Provider Plan',
          data_amount_gb: 5,
          call_minutes: 0,
          sms_count: 0,
          validity_days: 15,
          price: 19.99,
        });

      // Should fail due to foreign key constraint or validation
      expect([400, 404, 500]).toContain(response.statusCode);
    });
  });

  describe('PATCH /api/plans/:id (Update Plan)', () => {
    it('should update plan as admin', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_name: `Updated Plan ${Date.now()}`,
          price: 34.99,
        });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          plan_name: 'Hacked Plan',
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/plans/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          plan_name: 'Non-existent Plan',
        });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/plans/${planId}`)
        .send({
          plan_name: 'Anonymous Update',
        });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/plans/:id (Delete Plan)', () => {
    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/plans/${planId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).delete(
        `/api/plans/${planId}`,
      );

      expect(response.statusCode).toBe(401);
    });

    it('should delete plan as admin', async () => {
      // Create a plan to delete
      const createResponse = await request(app.getHttpServer())
        .post('/api/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider_id: providerId,
          plan_name: `Delete Test ${Date.now()}`,
          data_amount_gb: 5,
          call_minutes: 0,
          sms_count: 0,
          validity_days: 15,
          price: 14.99,
          is_active: true,
        });

      const deleteId = createResponse.body.plan_id;

      if (deleteId) {
        const response = await request(app.getHttpServer())
          .delete(`/api/plans/${deleteId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.statusCode).toBe(204);

        // Verify deletion
        const verifyResponse = await request(app.getHttpServer()).get(
          `/api/plans/${deleteId}`,
        );
        expect(verifyResponse.statusCode).toBe(404);
      }
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/plans/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });
  });
});
