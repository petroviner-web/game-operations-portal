import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HealthController } from '../src/health/health.controller';
import { DatabaseService } from '../src/database/database.service';

test('HTTP health contract supports outages and recovery, without leaking diagnostics', async () => {
  let databaseReady = true;
  @Module({
    controllers: [HealthController],
    providers: [{ provide: DatabaseService, useValue: { isReady: async () => databaseReady } }],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  try {
    const ready = await fetch(`${origin}/api/v1/health/ready`);
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get('cache-control'), 'no-store');
    assert.equal((await ready.json()).checks.database, 'up');

    databaseReady = false;
    const down = await fetch(`${origin}/api/v1/health/ready`);
    assert.equal(down.status, 503);
    assert.equal(down.headers.get('cache-control'), 'no-store');
    const body = await down.json();
    assert.equal(body.status, 'unavailable');
    assert.equal(body.checks.database, 'down');
    assert.deepEqual(Object.keys(body).sort(), ['checkedAt', 'checks', 'service', 'status']);
    assert.ok(Number.isFinite(Date.parse(body.checkedAt)));

    const live = await fetch(`${origin}/api/v1/health/live`);
    assert.equal(live.status, 200, 'a dependency outage must not fail liveness');
    databaseReady = true;
    assert.equal((await fetch(`${origin}/api/v1/health/ready`)).status, 200);
  } finally {
    await app.close();
  }
});
