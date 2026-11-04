import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { DEFAULT_RULES, RuleError, quoteVisit, type PetKind, type RuleSet, type ServiceLevel, type VisitQuote } from '@pawpal/shared';

interface QuoteBody {
  pets?: unknown;
  level?: unknown;
  overtimeUnits?: unknown;
}

const PET_KINDS: PetKind[] = ['cat', 'dog'];
const LEVELS: ServiceLevel[] = ['basic', 'upgrade'];

@Controller()
export class RulesController {
  @Get('rules')
  rules(): RuleSet {
    return DEFAULT_RULES;
  }

  @Post('pricing/quote')
  @HttpCode(200)
  quote(@Body() body: QuoteBody): VisitQuote {
    const { pets, level, overtimeUnits = 0 } = body ?? {};
    if (!Array.isArray(pets) || !pets.every((p) => PET_KINDS.includes(p))) {
      throw new RuleError('BAD_PETS', 'pets must be a list of "cat" or "dog"');
    }
    if (!LEVELS.includes(level as ServiceLevel)) throw new RuleError('BAD_LEVEL', 'level must be "basic" or "upgrade"');
    if (typeof overtimeUnits !== 'number') throw new RuleError('OVERTIME_INVALID', 'overtimeUnits must be a number');
    return quoteVisit(pets as PetKind[], level as ServiceLevel, overtimeUnits);
  }
}
