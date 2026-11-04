import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { MockGateway } from './mock-gateway';
import { MockGatewayController } from './mock-gateway.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/** PAYMENT_GATEWAY=mock until the real gateway is chosen (E15-1). */
function gatewayFactory(config: ConfigService): PaymentGateway {
  const name = config.get<string>('PAYMENT_GATEWAY', 'mock');
  if (name !== 'mock') throw new Error(`Payment gateway "${name}" is not built yet`);
  if (config.get('NODE_ENV') === 'production') throw new Error('The mock payment gateway cannot run in production');
  return new MockGateway(config.get<string>('MOCK_GATEWAY_SECRET', 'dev-mock-secret'));
}

@Module({
  controllers: [PaymentsController, MockGatewayController],
  providers: [PaymentsService, { provide: PAYMENT_GATEWAY, useFactory: gatewayFactory, inject: [ConfigService] }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
