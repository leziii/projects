import { Body, Controller, HttpCode, Inject, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RuleError, type MockOutcome, type Payment } from '@pawpal/shared';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { MockGateway, type MockWebhook } from './mock-gateway';
import { PaymentsService, type WebhookResult } from './payments.service';

const OUTCOMES: MockOutcome[] = ['success', 'failure', 'unknown'];

interface SimResult {
  payment: Payment;
  webhook: WebhookResult | 'none';
}

/** Development only: play the gateway's part. Answers 404 when a real gateway is configured. */
@Controller('mock-gateway')
export class MockGatewayController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** Decide a pending payment: success / failure send a webhook; unknown sends none. */
  @Post('payments/:id/outcome')
  @HttpCode(200)
  async outcome(@Param('id', ParseIntPipe) id: number, @Body() body: { outcome?: unknown }): Promise<SimResult> {
    const mock = this.mock();
    if (!OUTCOMES.includes(body?.outcome as MockOutcome)) throw new RuleError('BAD_OUTCOME', 'outcome must be success, failure or unknown');
    const gatewayRef = await this.gatewayRef(id, mock);
    const webhook = mock.settle(gatewayRef, body.outcome as MockOutcome);
    if (!webhook) {
      const payment = await this.payments.markChecking(id, { type: 'gateway' }, 'No callback from the gateway (mock: unknown)');
      return { payment, webhook: 'none' };
    }
    return this.deliver(id, webhook);
  }

  /** Send the last webhook again (a duplicate), as gateways do when they retry. */
  @Post('payments/:id/resend')
  @HttpCode(200)
  async resend(@Param('id', ParseIntPipe) id: number): Promise<SimResult> {
    const mock = this.mock();
    const webhook = mock.lastWebhook(await this.gatewayRef(id, mock));
    if (!webhook) throw new RuleError('NO_WEBHOOK', 'No webhook was sent for this payment yet');
    return this.deliver(id, webhook);
  }

  private async deliver(id: number, webhook: MockWebhook): Promise<SimResult> {
    const { result } = await this.payments.receiveWebhook('mock', webhook.rawBody, webhook.headers);
    return { payment: await this.payments.get(id), webhook: result };
  }

  private async gatewayRef(id: number, mock: MockGateway): Promise<string> {
    const { gatewayRef, status } = await this.payments.get(id);
    // Still open in PawPal but forgotten by a server restart: the mock picks it up again.
    if (gatewayRef && (status === 'pending' || status === 'checking')) mock.adopt(gatewayRef);
    if (!gatewayRef || !mock.knows(gatewayRef)) {
      throw new RuleError('MOCK_UNKNOWN', 'The mock gateway does not know this payment (it forgets after a server restart)');
    }
    return gatewayRef;
  }

  private mock(): MockGateway {
    if (!(this.gateway instanceof MockGateway)) throw new NotFoundException();
    return this.gateway;
  }
}
