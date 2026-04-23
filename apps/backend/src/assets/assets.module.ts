import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetsRepository } from './assets.repository';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsRepository } from './locations.repository';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './categories.repository';
import { CertificatesService } from './certificates.service';
import { DocumentsService } from './documents.service';
import { CertificateExpiryJob } from './jobs/certificate-expiry.job';

@Module({
  imports: [MailModule],
  controllers: [AssetsController, LocationsController, CategoriesController],
  providers: [
    AssetsService,
    AssetsRepository,
    LocationsService,
    LocationsRepository,
    CategoriesService,
    CategoriesRepository,
    CertificatesService,
    DocumentsService,
    CertificateExpiryJob,
  ],
  exports: [AssetsService, DocumentsService],
})
export class AssetsModule {}
