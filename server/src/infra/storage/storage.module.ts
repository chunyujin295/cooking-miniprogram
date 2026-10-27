import { Global, Module } from '@nestjs/common'
import { MinioStorage } from './minio-storage'
import { STORAGE_ADAPTER } from './storage.adapter'

@Global()
@Module({
  providers: [MinioStorage, { provide: STORAGE_ADAPTER, useExisting: MinioStorage }],
  exports: [STORAGE_ADAPTER, MinioStorage],
})
export class StorageModule {}
