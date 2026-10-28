import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Response } from 'express';
import { configureApp } from '../src/configure-app';
import type { AuthRequest } from '../src/auth/auth.types';
import { requestTelemetry, type RequestEvent } from '../src/request-telemetry';

test('HTTP telemetry correlates errors, hides input and logs each response once', async () => {
  const events: { level: string; data: RequestEvent }[] = [];
  const capture = (level: string) => (data: unknown) => {
    if (data && typeof data === 'object' && 'event' in data && data.event === 'http_request')
      events.push({ level, data: data as RequestEvent });
  };
  @Controller('probe')
  class ProbeController {
    @Post(':id')
    ok() {
      return { ok: true };
    }
    @Get('failure')
    failure() {
      throw new Error('PRIVATE_DATABASE_PASSWORD');
    }
  }
  @Module({ controllers: [ProbeController] })
  class ProbeModule {}
  const app = await NestFactory.create(ProbeModule, {
    bodyParser: false,
    logger: { log: capture('info'), warn: capture('warn'), error: capture('error') },
  });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  try {
    const headers = {
      'Content-Type': 'application/json',
      Cookie: 'session=PRIVATE_COOKIE',
      Authorization: 'Bearer PRIVATE_TOKEN',
      'X-Request-Id': 'PRIVATE_CLIENT_ID',
    };
    const ok = await fetch(`${origin}/api/v1/probe/PRIVATE_PATH?secret=PRIVATE_QUERY`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'PRIVATE_BODY', email: 'PRIVATE_EMAIL@example.test' }),
    });
    assert.equal(ok.status, 201);
    await ok.text();
    const broken = await fetch(`${origin}/api/v1/probe/failure`);
    assert.equal(broken.status, 500);
    const error = await broken.json();
    assert.equal(error.requestId, broken.headers.get('x-request-id'));
    assert.equal(error.code, 'SERVICE_ERROR');
    assert.ok(!JSON.stringify(error).includes('PRIVATE_DATABASE_PASSWORD'));
    const missing = await fetch(`${origin}/PRIVATE_MISSING?secret=PRIVATE_QUERY`);
    assert.equal(missing.status, 404);
    await missing.text();
    const malformed = await fetch(`${origin}/api/v1/probe/PRIVATE_PATH`, {
      method: 'POST',
      headers,
      body: '{"password":"PRIVATE_BAD_JSON"',
    });
    assert.equal(malformed.status, 400);
    await malformed.text();
    assert.equal(events.length, 4);
    assert.deepEqual(
      events.map(({ level }) => level),
      ['info', 'error', 'warn', 'warn'],
    );
    assert.equal(events[0]!.data.route, '/api/v1/probe/:id');
    assert.equal(events[0]!.data.requestId, ok.headers.get('x-request-id'));
    assert.equal(events[1]!.data.requestId, error.requestId);
    assert.equal(events[2]!.data.route, 'unmatched');
    assert.equal(events[3]!.data.route, 'unmatched');
    assert.equal(new Set(events.map(({ data }) => data.requestId)).size, 4);
    for (const { data } of events) {
      assert.match(data.requestId, /^[0-9a-f-]{36}$/);
      assert.ok(Number.isFinite(data.durationMs) && data.durationMs >= 0);
      assert.equal(data.outcome, 'finished');
      assert.deepEqual(Object.keys(data).sort(), [
        'durationMs',
        'event',
        'method',
        'outcome',
        'requestId',
        'route',
        'statusCode',
      ]);
    }
    assert.ok(
      !JSON.stringify(events).includes('PRIVATE_'),
      'No request data or exception message in logs',
    );
  } finally {
    await app.close();
  }
});

test('a disconnected response is recorded once without claiming a successful status', () => {
  const events: RequestEvent[] = [];
  const collect = (data: RequestEvent) => events.push(data);
  const response = Object.assign(new EventEmitter(), {
    setHeader: () => {},
    statusCode: 200,
    writableFinished: false,
  });
  let nextCalled = false;
  requestTelemetry({ log: collect, warn: collect, error: collect })(
    { method: 'PRIVATE_METHOD' } as AuthRequest,
    response as unknown as Response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  response.emit('close');
  response.emit('finish');
  assert.equal(events.length, 1);
  assert.equal(events[0]!.outcome, 'aborted');
  assert.equal(events[0]!.statusCode, null);
  assert.equal(events[0]!.method, 'OTHER');
  assert.equal(response.listenerCount('finish'), 0);
});
