import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { RuleError } from '@pawpal/shared';
import { catchError, type Observable, throwError } from 'rxjs';
import { captureError } from './sentry';

/** R61-1: unexpected server errors (not rule errors or 4xx answers) go to error tracking, then on as before. */
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        const expected = err instanceof RuleError || (err instanceof HttpException && err.getStatus() < 500);
        if (!expected) captureError(err);
        return throwError(() => err);
      }),
    );
  }
}
