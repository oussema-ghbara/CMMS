import { Module } from '@nestjs/common';
import { JobLoggerService } from './job-logger.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [JobLoggerService],
  exports: [JobLoggerService],
})
export class JobLoggerModule {}
