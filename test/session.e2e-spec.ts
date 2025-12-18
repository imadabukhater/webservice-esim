// test/session.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';

describe('Session (Authentication)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/sessions', () => {
    const url = '/api/sessions';

    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'admin@esims.com',
        password: 'AdminPass123!',
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
    });

    it('should return 401 with invalid password', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'admin@esims.com',
        password: 'WrongPassword123!',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with non-existent email', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'nonexistent@example.com',
        password: 'SomePassword123!',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with invalid email format', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'not-an-email',
        password: 'SomePassword123!',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with password too short', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'admin@esims.com',
        password: 'short',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with missing email', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        password: 'SomePassword123!',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with missing password', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'admin@esims.com',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
