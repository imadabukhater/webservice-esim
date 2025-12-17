// test/helpers/login.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TEST_DATA } from './seed-database';

/**
 * Login as admin user and return the JWT token
 */
export async function loginAdmin(app: INestApplication): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/sessions')
    .send({
      email: TEST_DATA.admin.email,
      password: TEST_DATA.admin.password,
    });

  // Session creation returns 201 Created
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(
      `Admin login failed with status ${response.statusCode}: ${JSON.stringify(response.body)}`,
    );
  }

  return response.body.token;
}

/**
 * Login as customer and return the JWT token
 */
export async function loginCustomer(app: INestApplication): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/sessions')
    .send({
      email: TEST_DATA.customer1.email,
      password: TEST_DATA.customer1.password,
    });

  // Session creation returns 201 Created
  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(
      `Customer login failed with status ${response.statusCode}: ${JSON.stringify(response.body)}`,
    );
  }

  return response.body.token;
}
