import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const isDev = configService.get<string>('NODE_ENV') !== 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: isDev ? true : configService.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });

  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GMAO API')
      .setDescription('Computerized Maintenance Management System')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  app.get(Logger).log(`GMAO API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal: failed to bootstrap application', err);
  process.exit(1);
});
