import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DbService } from '../db/db.service';
import { Sealer, keyFromEnv } from './sealer';

/**
 * The one encryption key for private text (addresses, IC numbers).
 * ADDRESS_KEY from the server settings. Production must set it. In development a key is made once and kept
 * in the database, which is fine for test data only.
 */
@Injectable()
export class SecretBox {
  private sealer?: Promise<Sealer>;

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async seal(plain: string): Promise<string> {
    return (await this.key()).seal(plain);
  }

  async open(sealed: string): Promise<string> {
    return (await this.key()).open(sealed);
  }

  /** Same text → same hash, so equal values can be found without decrypting; useless without the key. */
  async hash(plain: string): Promise<string> {
    return (await this.key()).hash(plain);
  }

  private key(): Promise<Sealer> {
    this.sealer ??= (async () => {
      const fromEnv = this.config.get<string>('ADDRESS_KEY', '');
      if (fromEnv) return new Sealer(keyFromEnv(fromEnv));
      if (this.config.get('NODE_ENV') === 'production') throw new Error('Set ADDRESS_KEY in production');
      await this.db.pool.query("INSERT INTO app_settings (key, value) VALUES ('address_key', $1) ON CONFLICT (key) DO NOTHING", [randomBytes(32).toString('base64')]);
      const { rows } = await this.db.pool.query<{ value: string }>("SELECT value FROM app_settings WHERE key = 'address_key'");
      return new Sealer(keyFromEnv(rows[0].value));
    })();
    return this.sealer;
  }
}
