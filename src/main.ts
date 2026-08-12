import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigModule } from '@nestjs/config';
import { LoggerConfig } from './jdozer/fuzzer/commons/logger-cfg';
import { Logger } from '@nestjs/common';

async function bootstrap() {

  try {
    await ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true
    });
  } catch (error) {
    console.error('Error setting up configuration:', error);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    logger: LoggerConfig.logLevels('JDozerFuzzer-Plataform')
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const logger = new Logger('JDozerFuzzer-Plataform');
  logger.log(`Application is running on: http://localhost:${port}`);


}
bootstrap();
