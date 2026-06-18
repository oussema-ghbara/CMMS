import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET_KEYS = {
  documents: 'MINIO_BUCKET_DOCUMENTS',
  photos: 'MINIO_BUCKET_PHOTOS',
  pdfs: 'MINIO_BUCKET_PDFS',
} as const;

export type StorageBucket = keyof typeof BUCKET_KEYS;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly presignedTtlSeconds: number;

  constructor(private readonly config: ConfigService) {

    const endpointRaw = config.getOrThrow<string>('MINIO_ENDPOINT');
    const port = config.get<number>('MINIO_PORT', 9000);
    const endpointBase = endpointRaw.startsWith('http') ? endpointRaw : `http://${endpointRaw}`;
    const endpointUrl = new URL(endpointBase);
    if (!endpointUrl.port) {
      endpointUrl.port = String(port);
    }
    const endpoint = endpointUrl.toString().replace(/\/$/, '');

    this.presignedTtlSeconds = config.get<number>('STORAGE_PRESIGNED_TTL_SECONDS', 3600);

    this.buckets = {
      documents: config.get<string>('MINIO_BUCKET_DOCUMENTS', 'documents'),
      photos: config.get<string>('MINIO_BUCKET_PHOTOS', 'photos'),
      pdfs: config.get<string>('MINIO_BUCKET_PDFS', 'pdfs'),
    };

    this.client = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO ignores region but SDK requires it
      credentials: {
        accessKeyId: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
      },
      forcePathStyle: true, // required for MinIO path-style addressing
    });
  }

  async onModuleInit(): Promise<void> {
    for (const [, bucket] of Object.entries(this.buckets)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    }
  }

  async upload(
    bucket: StorageBucket,
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.buckets[bucket],
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      throw new InternalServerErrorException(`Storage upload failed: ${String(err)}`);
    }
  }

  async getPresignedUrl(bucket: StorageBucket, key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
        { expiresIn: this.presignedTtlSeconds },
      );
    } catch (err) {
      throw new InternalServerErrorException(`Failed to generate presigned URL: ${String(err)}`);
    }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
    } catch (err) {
      throw new InternalServerErrorException(`Storage delete failed: ${String(err)}`);
    }
  }

  buildKey(entityType: string, entityId: string, fileName: string): string {
    return `${entityType}/${entityId}/${Date.now()}-${fileName}`;
  }
}
