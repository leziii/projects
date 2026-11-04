import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ADDRESS_RULES, checkAddress, type Address, type AddressFields, type AddressInput, type User, type VisitAddress } from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { SecretBox } from '../files/secret-box';

interface AddressRow {
  id: number;
  label: string;
  area: AddressFields['area'];
  secret: string;
  is_default: boolean;
  updated: string;
}

type Secret = Pick<AddressFields, 'street' | 'unit' | 'postcode' | 'contactName' | 'contactPhone' | 'emergencyName' | 'emergencyPhone'>;

const SELECT = `SELECT id, label, area, secret, is_default, ${ts('updated_at')} AS updated FROM addresses`;

/** Owner addresses (E3-4). Private parts are encrypted; every query is limited to the owner's own addresses. */
@Injectable()
export class AddressesService {
  constructor(
    private readonly db: DbService,
    private readonly secrets: SecretBox,
  ) {}

  async list(user: User): Promise<Address[]> {
    const { rows } = await this.db.pool.query<AddressRow>(`${SELECT} WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, id`, [user.id]);
    return Promise.all(rows.map((r) => this.toAddress(r)));
  }

  async get(user: User, id: number): Promise<Address> {
    return this.toAddress(await this.row(user, id));
  }

  async create(user: User, input: Partial<AddressInput>): Promise<Address> {
    const a = checkAddress(input);
    const secret = await this.seal(a);
    const id = await this.db.tx(async (client) => {
      // Lock the owner so two adds at once cannot pass the limit.
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const { rows } = await client.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM addresses WHERE owner_id = $1 AND deleted_at IS NULL', [user.id]);
      if (rows[0].n >= ADDRESS_RULES.maxAddresses) {
        throw new ConflictException({ code: 'ADDRESS_LIMIT', message: `You can save up to ${ADDRESS_RULES.maxAddresses} addresses` });
      }
      const inserted = await client.query<{ id: number }>(
        'INSERT INTO addresses (owner_id, label, area, secret, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [user.id, a.label, a.area, secret, rows[0].n === 0],
      );
      return inserted.rows[0].id;
    });
    return this.get(user, id);
  }

  async update(user: User, id: number, input: Partial<AddressInput>): Promise<Address> {
    const a = checkAddress(input);
    await this.row(user, id);
    await this.db.pool.query('UPDATE addresses SET label = $2, area = $3, secret = $4, updated_at = now() WHERE id = $1', [id, a.label, a.area, await this.seal(a)]);
    return this.get(user, id);
  }

  async makeDefault(user: User, id: number): Promise<Address[]> {
    await this.db.tx(async (client) => {
      await this.row(user, id, client);
      await this.setDefault(client, user, id);
    });
    return this.list(user);
  }

  /** Soft delete: later bookings keep pointing at the address they used. The next one becomes default. */
  async remove(user: User, id: number): Promise<Address[]> {
    await this.db.tx(async (client) => {
      const row = await this.row(user, id, client);
      await client.query('UPDATE addresses SET deleted_at = now(), is_default = false WHERE id = $1', [id]);
      if (row.is_default) {
        const { rows } = await client.query<{ id: number }>('SELECT id FROM addresses WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY id LIMIT 1', [user.id]);
        if (rows[0]) await this.setDefault(client, user, rows[0].id);
      }
    });
    return this.list(user);
  }

  private async setDefault(client: PoolClient, user: User, id: number) {
    await client.query('UPDATE addresses SET is_default = false WHERE owner_id = $1 AND is_default', [user.id]);
    await client.query('UPDATE addresses SET is_default = true WHERE id = $1', [id]);
  }

  private async toAddress(r: AddressRow): Promise<Address> {
    const s = JSON.parse(await this.secrets.open(r.secret)) as Secret;
    return { id: r.id, label: r.label, area: r.area, ...s, isDefault: r.is_default, updatedAt: r.updated };
  }

  private async seal(a: AddressFields): Promise<string> {
    const secret: Secret = {
      street: a.street,
      unit: a.unit,
      postcode: a.postcode,
      contactName: a.contactName,
      contactPhone: a.contactPhone,
      emergencyName: a.emergencyName,
      emergencyPhone: a.emergencyPhone,
    };
    return this.secrets.seal(JSON.stringify(secret));
  }

  /** R26-4: the street and contact person, for the caregiver of an accepted order only (callers check that). */
  async forVisit(id: number): Promise<VisitAddress | null> {
    const { rows } = await this.db.pool.query<{ secret: string }>('SELECT secret FROM addresses WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const s = JSON.parse(await this.secrets.open(rows[0].secret)) as Secret;
    return { street: s.street, unit: s.unit, postcode: s.postcode, contactName: s.contactName, contactPhone: s.contactPhone };
  }

  /** Someone else's address looks the same as a missing one. */
  private async row(user: User, id: number, conn?: PoolClient): Promise<AddressRow> {
    const { rows } = await (conn ?? this.db.pool).query<AddressRow>(`${SELECT} WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`, [id, user.id]);
    if (!rows[0]) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' });
    return rows[0];
  }
}
