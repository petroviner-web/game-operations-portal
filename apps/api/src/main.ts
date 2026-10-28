import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { readAuthConfig } from './auth/auth.config';
import { configureApp } from './configure-app';

async function bootstrap() {
  const config = readConfig();
  readAuthConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port, '127.0.0.1');
}

bootstrap().catch(() => {
  console.error(
    'API startup failed. Check DATABASE_URL, CSRF_SECRET, APP_ORIGIN, API_PORT, and port availability.',
  );
  process.exitCode = 1;
});
