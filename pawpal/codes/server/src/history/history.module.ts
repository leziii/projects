import { Global, Module } from '@nestjs/common';
import { ActionLogController } from './action-log.controller';
import { ActionLogService } from './action-log.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Global()
@Module({ controllers: [HistoryController, ActionLogController], providers: [HistoryService, ActionLogService], exports: [HistoryService] })
export class HistoryModule {}
