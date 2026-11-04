import { describe, expect, it } from 'vitest';
import { INPUT_THROTTLE_MS, settleInputs } from './inputs';

describe('settleInputs', () => {
  it('waits longer than the input throttle', async () => {
    const start = Date.now();
    await settleInputs();
    expect(Date.now() - start).toBeGreaterThanOrEqual(INPUT_THROTTLE_MS);
  });
});
