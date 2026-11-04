// Dev helper: lists every account with its caregiver details. Run from codes/server: node scripts/list-accounts.mjs
import pg from 'pg';

const { Client } = pg;
const url = process.env.DATABASE_URL || 'postgres://pawpal:pawpal@localhost:5433/pawpal';
const sql = `SELECT u.id, u.phone, u.caregiver_status AS status, p.display_name AS name, array_to_string(p.areas, ', ') AS areas,
  p.cats, p.dogs, p.max_dog_size AS dog_size, p.overtime_max_min AS overtime
  FROM users u LEFT JOIN caregiver_profiles p ON p.user_id = u.id ORDER BY u.id DESC LIMIT 60`;
const c = new Client(url);
c.connect()
  .then(() => c.query(sql))
  .then((r) => console.table(r.rows))
  .catch((e) => console.error(e.message))
  .finally(() => c.end());
