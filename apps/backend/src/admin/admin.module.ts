import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [PrismaModule, SystemConfigModule],
  controllers: [AdminController],
})
export class AdminModule {}
