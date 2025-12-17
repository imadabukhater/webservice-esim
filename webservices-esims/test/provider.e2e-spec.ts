// test/provider.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

describe('Providers', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let createdProviderId: number;
  let providerId: number;

  beforeAll(async () => {
    app = await createApp();
    const ids = getSeededIds();
    providerId = ids.providers[0];

    // Get tokens using login helper
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/providers (Get All Providers)', () => {
    const url = '/api/providers';

    it('should return all providers (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('provider_id');
      expect(response.body[0]).toHaveProperty('name');
    });

    it('should return providers with correct structure', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(200);
      const provider = response.body[0];
      expect(provider).toHaveProperty('provider_id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('is_active');
    });
  });

  describe('GET /api/providers/:id (Get Provider by ID)', () => {
    it('should return provider by ID (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/providers/${providerId}`,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('provider_id', providerId);
      expect(response.body).toHaveProperty('name');
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer()).get('/api/providers/99999');

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid ID format', async () => {
      const response = await request(app.getHttpServer()).get('/api/providers/invalid');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/providers (Create Provider)', () => {
    const url = '/api/providers';

    it('should create provider as admin', async () => {
      const uniqueName = `Test Provider ${Date.now()}`;
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: uniqueName,
          logo_url: 'https://example.com/logo.png',
          is_active: true,
          description: 'Test provider description',
        });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('provider_id');
      expect(response.body.name).toBe(uniqueName);
      createdProviderId = response.body.provider_id;
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Unauthorized Provider',
          is_active: true,
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .send({
          name: 'Anonymous Provider',
          is_active: true,
        });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          logo_url: 'https://example.com/logo.png',
        });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/providers/:id (Update Provider)', () => {
    it('should update provider as admin', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/providers/${createdProviderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Updated Provider ${Date.now()}`,
          description: 'Updated description',
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.description).toBe('Updated description');
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/providers/${providerId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Hacked Provider',
        });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/providers/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Non-existent Provider',
        });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/providers/:id/plans (Get Provider Plans)', () => {
    it('should return plans for provider (public endpoint)', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/providers/${providerId}/plans`,
      );

      expect(response.statusCode).toBe(200);
      // Response includes provider info with plans array
      expect(response.body).toHaveProperty('provider_id');
      expect(response.body).toHaveProperty('plans');
      expect(Array.isArray(response.body.plans)).toBe(true);
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/providers/99999/plans',
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/providers/:id/esims (Get Provider eSIMs)', () => {
    it('should return eSIMs for provider as admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/providers/${providerId}/esims`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/providers/${providerId}/esims`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/providers/${providerId}/esims`,
      );

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/providers/:id (Delete Provider)', () => {
    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/providers/${providerId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).delete(
        `/api/providers/${providerId}`,
      );

      expect(response.statusCode).toBe(401);
    });

    it('should delete provider as admin', async () => {
      // Create a provider to delete
      const uniqueName = `Delete Test ${Date.now()}`;
      const createResponse = await request(app.getHttpServer())
        .post('/api/providers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: uniqueName,
          is_active: true,
        });

      const deleteId = createResponse.body.provider_id;

      const response = await request(app.getHttpServer())
        .delete(`/api/providers/${deleteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const verifyResponse = await request(app.getHttpServer()).get(`/api/providers/${deleteId}`);
      expect(verifyResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/providers/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });
  });
});
