import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RuleErrorFilter } from '../common/rule-error.filter';
import { RulesController } from './rules.controller';

@Module({ controllers: [RulesController], providers: [{ provide: APP_FILTER, useClass: RuleErrorFilter }] })
export class RulesModule {}
