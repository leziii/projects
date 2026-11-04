import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { RuleError } from '@pawpal/shared';
import type { Response } from 'express';

/** Business rule violations become 400 with a stable code the apps can show. */
@Catch(RuleError)
export class RuleErrorFilter implements ExceptionFilter {
  catch(err: RuleError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(400).json({ code: err.code, message: err.message });
  }
}
