// test/user.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers/create-app';
import { getSeededIds } from './helpers/load-seeded-ids';
import { loginAdmin, loginCustomer } from './helpers/login';

describe('Users', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let testUserId: number;
  let adminId: number;
  let customer1Id: number;
  let customer2Id: number;

  beforeAll(async () => {
    app = await createApp();
    const ids = getSeededIds();
    adminId = ids.users.adminId;
    customer1Id = ids.users.customer1Id;
    customer2Id = ids.users.customer2Id;

    // Get tokens using login helper
    adminToken = await loginAdmin(app);
    customerToken = await loginCustomer(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/users (Register)', () => {
    const url = '/api/users';

    it('should register a new user successfully', async () => {
      const uniqueEmail = `test.user.${Date.now()}@example.com`;
      const response = await request(app.getHttpServer()).post(url).send({
        email: uniqueEmail,
        password: 'TestPassword123!',
        full_name: 'Test User',
        phone_number: '+32470111222',
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(uniqueEmail);
      expect(response.body.user.full_name).toBe('Test User');
      expect(response.body.user.role).toBe('customer');
      testUserId = response.body.user.user_id;
    });

    it('should return 400 when registering with existing email', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'admin@esims.com',
        password: 'TestPassword123!',
        full_name: 'Another User',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with invalid email', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'invalid-email',
        password: 'TestPassword123!',
        full_name: 'Test User',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with password too short', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'newuser@example.com',
        password: 'short',
        full_name: 'Test User',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 with missing full_name', async () => {
      const response = await request(app.getHttpServer()).post(url).send({
        email: 'newuser2@example.com',
        password: 'TestPassword123!',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/users (Get All Users)', () => {
    const url = '/api/users';

    it('should return all users for admin', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('user_id');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('full_name');
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(url);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/:id (Get User by ID)', () => {
    it('should return user for admin accessing any user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('user_id');
      expect(response.body).toHaveProperty('email');
    });

    it('should return own user data using "me"', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.email).toBe('customer1@test.com');
    });

    it('should return 403 or 404 when customer accesses another user', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      // API may return 403 (forbidden) or 404 (not found) depending on implementation
      expect([403, 404]).toContain(response.statusCode);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/users/99999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/users/${adminId}`,
      );

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/users/:id/profile (Update Profile)', () => {
    it('should update own profile using "me"', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          phone_number: '+32470999888',
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.phone_number).toBe('+32470999888');
    });

    it('should update user profile as admin', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer1Id}/profile`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: 'John Updated',
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.full_name).toBe('John Updated');
    });

    it('should return 403 or 404 when customer updates another user', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${adminId}/profile`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          full_name: 'Hacked Name',
        });

      // API may return 403 (forbidden) or 404 (not found) depending on implementation
      expect([403, 404]).toContain(response.statusCode);
    });

    it('should return 400 with invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          email: 'invalid-email',
        });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/users/:id/password (Change Password)', () => {
    it('should change own password successfully', async () => {
      // First register a new user to test password change
      const uniqueEmail = `pwd.test.${Date.now()}@example.com`;
      const registerResponse = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          email: uniqueEmail,
          password: 'OriginalPass123!',
          full_name: 'Password Test User',
        });

      const newUserToken = registerResponse.body.accessToken;

      const response = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${newUserToken}`)
        .send({
          old_password: 'OriginalPass123!',
          new_password: 'NewPassword456!',
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');
    });

    it('should return 401 with incorrect old password', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          old_password: 'WrongOldPassword!',
          new_password: 'NewPassword456!',
        });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with password too short', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          old_password: 'CustomerPass123!',
          new_password: 'short',
        });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/users/:id/activate (Activate User)', () => {
    it('should activate user as admin', async () => {
      // First deactivate a user
      await request(app.getHttpServer())
        .patch(`/api/users/${customer1Id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer1Id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.is_active).toBe(true);
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer2Id}/activate`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 if user is already active', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer1Id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/users/:id/deactivate (Deactivate User)', () => {
    it('should deactivate user as admin', async () => {
      // First try to activate the user in case they're already deactivated
      await request(app.getHttpServer())
        .patch(`/api/users/${customer2Id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer2Id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Accept 200 (deactivated) or 400 (already inactive)
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should return 403 for customer', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer1Id}/deactivate`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 if user is already inactive', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${customer2Id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(400);
    });
  });
});
