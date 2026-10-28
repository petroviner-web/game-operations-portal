import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config';

test('validates configuration without including credentials in errors', () => {
  assert.deepEqual(readConfig({ DATABASE_URL: 'postgresql://user:secret@localhost/db' }), {
    databaseUrl: 'postgresql://user:secret@localhost/db',
    port: 4000,
  });
  assert.throws(() => readConfig({}), /DATABASE_URL is required/);
  for (const url of [
    'https://user:secret@localhost/db',
    'broken-secret',
    'postgresql://localhost/',
  ]) {
    assert.throws(
      () => readConfig({ DATABASE_URL: url }),
      (error: Error) => !error.message.includes('secret'),
    );
  }
  for (const port of ['0', '-1', '65536', '1.5', 'abc', '']) {
    assert.throws(
      () => readConfig({ DATABASE_URL: 'postgresql://localhost/db', API_PORT: port }),
      /API_PORT/,
    );
  }
});
