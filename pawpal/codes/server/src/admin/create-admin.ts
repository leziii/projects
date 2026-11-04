/**
 * Creates an admin account from the command line: `pnpm admin:create` (asks for username, name, password).
 * Prints a QR code to scan with Google / Microsoft Authenticator. The secret is shown only this once.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline';
import qrcode from 'qrcode-terminal';
import { AppModule } from '../app.module';
import { AdminAuthService } from './admin-auth.service';

/** One prompt for all questions (so piped input works too); hidden answers echo as "*". */
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let hiding = false;
const raw = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WriteStream };
const write = raw._writeToOutput?.bind(rl);
raw._writeToOutput = (s: string) => (hiding && write ? raw.output.write(s.replace(/[^\r\n]/g, '*')) : write ? write(s) : raw.output.write(s));

const lines = rl[Symbol.asyncIterator]();
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  hiding = hidden;
  const { value } = await lines.next();
  hiding = false;
  if (hidden && process.stdin.isTTY) process.stdout.write('\n');
  return String(value ?? '').trim();
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const username = await ask('Username: ');
    const name = await ask('Full name: ');
    const password = await ask('Password (10+ characters, letters and digits): ', true);
    if ((await ask('Repeat password: ', true)) !== password) throw new Error('The passwords do not match');
    const created = await app.get(AdminAuthService).create({ username, name, password });
    console.log(`\nAdmin "${created.admin.username}" created with access to: ${created.admin.pages.join(', ')}.`);
    console.log('Scan this QR code with Google Authenticator or Microsoft Authenticator:\n');
    qrcode.generate(created.otpauthUrl, { small: true });
    console.log(`Or type this setup key in the app: ${created.totpSecret}`);
    console.log('This key is shown only now. Then log in at the admin console with username, password and the 6-digit code.');
  } catch (err) {
    console.error(`\nNot created: ${(err as { response?: { message?: string } }).response?.message ?? (err as Error).message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await app.close();
  }
}

void main();
