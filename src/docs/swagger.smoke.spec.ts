import express from 'express';
import request from 'supertest';
import { mountSwagger } from './swagger';

function makeApp() {
  const app = express();
  mountSwagger(app);
  return app;
}

describe('swagger mount', () => {
  it('serves the raw spec at /api/docs.json', async () => {
    const res = await request(makeApp()).get('/api/docs.json');
    expect(res.status).toBe(200);
    const body = res.body as { openapi: string; info: { title: string } };
    expect(body.openapi).toBe('3.0.3');
    expect(body.info.title).toContain('AutoWash');
  });

  it('serves Swagger UI at /api/docs/', async () => {
    const res = await request(makeApp()).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });
});
