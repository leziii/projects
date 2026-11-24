import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RuleErrorFilter } from '../common/rule-error.filter';
import { AdminRulesController, RulesController, RulesDevController } from './rules.controller';
import { RulesService } from './rules.service';

@Global()
@Module({
  controllers: [RulesController, AdminRulesController, RulesDevController],
  providers: [RulesService, { provide: APP_FILTER, useClass: RuleErrorFilter }],
  exports: [RulesService],
})
export class RulesModule {}
