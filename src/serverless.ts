import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type Request, type Response } from 'express';
import { AppModule } from './app.module';

const expressServer = express();
let bootstrapPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressServer),
    { logger: ['log', 'warn', 'error'] },
  );

  const configService = app.get(ConfigService);

  const globalPrefix = configService.getOrThrow<string>('app.globalPrefix');
  app.setGlobalPrefix(globalPrefix);

  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Idempotent-Replayed'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Car-wash Booking API')
    .setDescription('Backend API documentation')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.init();
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  await bootstrapPromise;
  expressServer(req, res);
}
