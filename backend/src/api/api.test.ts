import { describe, expect, it, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp, extractVehiclesFromToolResults } from '../index.js';
import { addMessage, getMessages } from '../database/repositories.js';
import { OpenRouterRateLimitError } from '../ai/openrouter.service.js';

const testDatabasePath = path.resolve(process.cwd(), 'data/api-test.db');
if (fs.existsSync(testDatabasePath)) fs.rmSync(testDatabasePath);
process.env.RATE_LIMIT_MAX = '20';

const resources = createApp({
  databaseUrl: `file:${testDatabasePath}`,
  startMcp: false,
  openRouterApiKey: '',
});

describe('backend REST API', () => {
  it('deduplicates vehicle results returned by multiple MCP tools', () => {
    const vehicle = { id: 'vehicle-1', brand: 'Toyota', model: 'Avanza' };
    const results = extractVehiclesFromToolResults([
      { result: { structuredContent: { vehicles: [vehicle] } } },
      { result: { structuredContent: { vehicle } } },
    ]);
    expect(results).toEqual([vehicle]);
  });

  it('returns health status', async () => {
    const response = await request(resources.app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.operationStatus).toBe('ok');
  });

  it('reports MCP connection state without secrets', async () => {
    const response = await request(resources.app).get('/api/health/mcp').expect(200);
    expect(response.body).toEqual({ inventory: false, booking: false, toolCount: 0 });
  });

  it('reports missing LLM configuration safely', async () => {
    const response = await request(resources.app).get('/api/health/llm').expect(503);
    expect(response.body.configured).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('OPENROUTER_API_KEY');
  });

  it('validates speech text and voice before calling the provider', async () => {
    await request(resources.app).post('/api/speech').send({ text: ' ' }).expect(400);
    const invalidVoice = await request(resources.app)
      .post('/api/speech')
      .send({ text: 'Halo', voice: 'not-a-voice' })
      .expect(400);
    expect(invalidVoice.body.code).toBe('VALIDATION_ERROR');
    const oversizedText = await request(resources.app)
      .post('/api/speech')
      .send({ text: 'a'.repeat(2001) })
      .expect(400);
    expect(oversizedText.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns generated speech as raw MP3 without exposing provider credentials', async () => {
    const originalSynthesize = resources.speech.synthesize;
    let receivedText = '';
    resources.speech.synthesize = async (text) => {
      receivedText = text;
      return new Uint8Array([0x49, 0x44, 0x33]);
    };
    try {
      const response = await request(resources.app)
        .post('/api/speech')
        .send({ text: '  Halo, selamat datang.  ' })
        .expect(200);
      expect(receivedText).toBe('Halo, selamat datang.');
      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(Buffer.from([0x49, 0x44, 0x33]));
      expect(JSON.stringify(response.headers)).not.toContain('OPENROUTER_API_KEY');
    } finally {
      resources.speech.synthesize = originalSynthesize;
    }
  });

  it('returns a safe error when speech generation is rate limited', async () => {
    const originalSynthesize = resources.speech.synthesize;
    resources.speech.synthesize = async () => {
      throw new OpenRouterRateLimitError('provider rate limit');
    };
    try {
      const response = await request(resources.app)
        .post('/api/speech')
        .send({ text: 'Halo' })
        .expect(429);
      expect(response.body.code).toBe('OPENROUTER_RATE_LIMITED');
      expect(JSON.stringify(response.body)).not.toContain('provider rate limit');
    } finally {
      resources.speech.synthesize = originalSynthesize;
    }
  });

  it('rejects speech generation when no provider key is configured', async () => {
    const response = await request(resources.app)
      .post('/api/speech')
      .send({ text: 'Halo' })
      .expect(503);
    expect(response.body.code).toBe('OPENROUTER_CONFIGURATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('OPENROUTER_API_KEY');
  });

  it('reports configured but unreachable LLM as unavailable', async () => {
    const originalHealthCheck = resources.openRouter.healthCheck;
    resources.openRouter.healthCheck = async () => ({
      configured: true,
      reachable: false,
      model: 'qa-test-model',
      error: 'OpenRouter rejected the API credentials',
    });
    try {
      const response = await request(resources.app).get('/api/health/llm').expect(503);
      expect(response.body.configured).toBe(true);
      expect(response.body.reachable).toBe(false);
    } finally {
      resources.openRouter.healthCheck = originalHealthCheck;
    }
  });

  it('returns development sample vehicles', async () => {
    const response = await request(resources.app).get('/api/vehicles').expect(200);
    expect(response.body.dataSource).toBe('development-sample-data');
    expect(response.body.vehicles.length).toBe(8);
  });

  it('does not seed development vehicles in production by default', async () => {
    const databasePath = path.resolve(process.cwd(), 'data/production-no-seed-test.db');
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSeedFlag = process.env.SEED_DEVELOPMENT_DATA;
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${databasePath}${suffix}`;
      if (fs.existsSync(file)) fs.rmSync(file);
    }

    process.env.NODE_ENV = 'production';
    delete process.env.SEED_DEVELOPMENT_DATA;
    const productionResources = createApp({
      databaseUrl: `file:${databasePath}`,
      startMcp: false,
      openRouterApiKey: '',
    });
    try {
      expect(
        productionResources.database.prepare('SELECT COUNT(*) AS count FROM vehicles').get(),
      ).toEqual({ count: 0 });
      const response = await request(productionResources.app).get('/api/vehicles').expect(200);
      expect(response.body.dataSource).toBe('database');
      expect(response.body.vehicles).toHaveLength(0);
    } finally {
      productionResources.database.close();
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalSeedFlag === undefined) delete process.env.SEED_DEVELOPMENT_DATA;
      else process.env.SEED_DEVELOPMENT_DATA = originalSeedFlag;
      for (const suffix of ['', '-wal', '-shm']) {
        const file = `${databasePath}${suffix}`;
        if (fs.existsSync(file)) fs.rmSync(file);
      }
    }
  });

  it('returns booking not found safely', async () => {
    const response = await request(resources.app).get('/api/bookings/ERB-NOT-FOUND').expect(404);
    expect(response.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('validates chat request', async () => {
    const response = await request(resources.app)
      .post('/api/chat')
      .send({ message: '' })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns not found for unknown endpoint', async () => {
    await request(resources.app).get('/api/unknown').expect(404);
  });

  it('reset conversation state', async () => {
    addMessage(resources.database, 'api-test-conversation', 'user', 'temporary message');
    expect(getMessages(resources.database, 'api-test-conversation')).toHaveLength(1);
    const response = await request(resources.app)
      .post('/api/chat/reset')
      .send({ conversationId: 'api-test-conversation' })
      .expect(200);
    expect(response.body.conversationId).toBe('api-test-conversation');
    expect(getMessages(resources.database, 'api-test-conversation')).toHaveLength(0);
  });

  it('requires a server-managed pending action for confirmation', async () => {
    const response = await request(resources.app)
      .post('/api/chat/confirm')
      .send({ conversationId: 'missing-pending', decision: 'confirm' })
      .expect(409);
    expect(response.body.code).toBe('NO_PENDING_ACTION');
  });

  it('cancels a pending booking action without writing a booking', async () => {
    resources.pendingActions.create('cancel-pending-test', 'create_booking', {
      customer_name: 'QA Cancel Tester',
      customer_phone: '+628000000002',
      vehicle_id: 'DEV-TOYOTA-AVANZA',
      start_date: '2099-12-10',
      end_date: '2099-12-12',
      pickup_location: 'QA Pickup',
      return_location: 'QA Return',
    });

    const ordinaryMessage = await request(resources.app)
      .post('/api/chat')
      .send({ conversationId: 'cancel-pending-test', message: 'yes' })
      .expect(409);
    expect(ordinaryMessage.body.code).toBe('EXPLICIT_CONFIRMATION_REQUIRED');
    expect(resources.pendingActions.get('cancel-pending-test')).toBeDefined();

    const response = await request(resources.app)
      .post('/api/chat/confirm')
      .send({ conversationId: 'cancel-pending-test', decision: 'cancel' })
      .expect(200);
    expect(response.body.operationStatus).toBe('cancelled');
    expect(resources.pendingActions.get('cancel-pending-test')).toBeUndefined();
    expect(
      resources.database
        .prepare('SELECT COUNT(*) AS count FROM bookings WHERE customer_name = ?')
        .get('QA Cancel Tester'),
    ).toEqual({ count: 0 });
  });

  it('returns safe error for valid chat when LLM is not configured', async () => {
    const response = await request(resources.app)
      .post('/api/chat')
      .send({ conversationId: 'no-key-chat', message: 'Hello' })
      .expect(503);
    expect(response.body.code).toBe('OPENROUTER_CONFIGURATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('returns an actionable response when OpenRouter rate limits chat', async () => {
    const originalSendMessage = resources.openRouter.sendMessage;
    resources.openRouter.sendMessage = async () => {
      throw new OpenRouterRateLimitError('provider rate limit');
    };
    try {
      const response = await request(resources.app)
        .post('/api/chat')
        .send({ conversationId: 'rate-limited-chat', message: 'Cari mobil yang tersedia' })
        .expect(429);
      expect(response.body.code).toBe('OPENROUTER_RATE_LIMITED');
      expect(response.body.error).toContain('batas permintaan');
      expect(JSON.stringify(response.body)).not.toContain('provider rate limit');
    } finally {
      resources.openRouter.sendMessage = originalSendMessage;
    }
  });

  it('rate limits API requests', async () => {
    const responses = [];
    for (let index = 0; index < 15; index += 1) {
      responses.push(await request(resources.app).get('/api/health'));
    }
    expect(responses.some((response) => response.status === 429)).toBe(true);
    expect(responses.find((response) => response.status === 429)?.body.code).toBe('RATE_LIMITED');
  });
});

afterAll(() => {
  resources.database.close();
  if (fs.existsSync(testDatabasePath)) fs.rmSync(testDatabasePath);
});
