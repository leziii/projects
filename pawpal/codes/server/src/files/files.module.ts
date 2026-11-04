import { Global, Module } from '@nestjs/common';
import { FileStore } from './file-store';
import { SecretBox } from './secret-box';

@Global()
@Module({ providers: [FileStore, SecretBox], exports: [FileStore, SecretBox] })
export class FilesModule {}
