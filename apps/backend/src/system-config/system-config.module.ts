import { Global, Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';

// Global so any module can inject SystemConfigService without
// importing SystemConfigModule explicitly. Password policy is
// needed by AuthModule (setup/reset endpoints) and UsersModule.
@Global()
@Module({
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
