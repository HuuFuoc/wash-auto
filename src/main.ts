import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;

  await app.listen(port);
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}
void bootstrap();
