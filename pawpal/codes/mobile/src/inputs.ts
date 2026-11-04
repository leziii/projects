/** uni-app's <input> sends typing to v-model at most every 100 ms; the last change can arrive up to 100 ms late. */
export const INPUT_THROTTLE_MS = 100;

/** Wait for the last typed character to reach v-model before reading a form (e.g. a fast tap on "Log in" after paste). */
export const settleInputs = () => new Promise<void>((resolve) => setTimeout(resolve, INPUT_THROTTLE_MS + 20));
