/**
 * Database migrations (PostgreSQL), applied in order at server start, each in one transaction.
 * Never edit an applied one: add a new one.
 */
export interface Migration {
  id: string;
  sql: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_payments',
    sql: [
      `CREATE TABLE payments (
        id BIGSERIAL PRIMARY KEY,
        ref VARCHAR(64) NOT NULL UNIQUE,
        kind VARCHAR(16) NOT NULL CHECK (kind IN ('charge', 'refund', 'payout')),
        parent_id BIGINT NULL REFERENCES payments (id),
        amount_sen INTEGER NOT NULL CHECK (amount_sen > 0),
        method VARCHAR(16) NULL,
        payee VARCHAR(64) NULL,
        status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'checking', 'succeeded', 'failed')),
        gateway VARCHAR(16) NOT NULL,
        gateway_ref VARCHAR(64) NULL UNIQUE,
        failure_reason VARCHAR(255) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_payments_parent ON payments (parent_id)',
      `CREATE TABLE gateway_events (
        id BIGSERIAL PRIMARY KEY,
        gateway VARCHAR(16) NOT NULL,
        event_id VARCHAR(64) NOT NULL,
        gateway_ref VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL,
        result VARCHAR(16) NOT NULL,
        payload TEXT NOT NULL,
        received_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        UNIQUE (gateway, event_id)
      )`,
      'CREATE INDEX idx_events_ref ON gateway_events (gateway_ref)',
    ],
  },
  {
    id: '002_status_history',
    sql: [
      `CREATE TABLE status_history (
        id BIGSERIAL PRIMARY KEY,
        entity VARCHAR(32) NOT NULL,
        entity_id BIGINT NOT NULL,
        from_status VARCHAR(32) NULL,
        to_status VARCHAR(32) NOT NULL,
        actor_type VARCHAR(16) NOT NULL,
        actor_id VARCHAR(64) NULL,
        reason VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_history_entity ON status_history (entity, entity_id, id)',
    ],
  },
  {
    id: '003_users_sessions',
    sql: [
      `CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        phone VARCHAR(16) NOT NULL UNIQUE,
        terms_accepted_at TIMESTAMPTZ(3) NOT NULL,
        last_login_at TIMESTAMPTZ(3) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE sessions (
        id BIGSERIAL PRIMARY KEY,
        token_hash CHAR(64) NOT NULL UNIQUE,
        user_id BIGINT NOT NULL REFERENCES users (id),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ(3) NOT NULL,
        revoked_at TIMESTAMPTZ(3) NULL
      )`,
      'CREATE INDEX idx_sessions_user ON sessions (user_id)',
    ],
  },
  {
    id: '004_roles',
    sql: [
      `ALTER TABLE users ADD COLUMN caregiver_status VARCHAR(16) NOT NULL DEFAULT 'none'
        CHECK (caregiver_status IN ('none', 'pending', 'approved', 'rejected', 'suspended'))`,
      `ALTER TABLE sessions ADD COLUMN active_role VARCHAR(16) NOT NULL DEFAULT 'owner' CHECK (active_role IN ('owner', 'caregiver'))`,
    ],
  },
  {
    id: '005_messages',
    sql: [
      `CREATE TABLE messages (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users (id),
        role VARCHAR(16) NULL CHECK (role IN ('owner', 'caregiver')),
        category VARCHAR(16) NOT NULL CHECK (category IN ('order', 'refund', 'dispute', 'account')),
        title VARCHAR(60) NOT NULL,
        body VARCHAR(300) NOT NULL,
        link_type VARCHAR(32) NULL,
        link_id BIGINT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ(3) NULL
      )`,
      'CREATE INDEX idx_messages_user ON messages (user_id, id)',
    ],
  },
  {
    id: '006_admins',
    sql: [
      `CREATE TABLE admins (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        name VARCHAR(64) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        totp_secret VARCHAR(64) NOT NULL,
        last_totp_step BIGINT NOT NULL DEFAULT 0,
        pages TEXT[] NOT NULL,
        failed_count INT NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ(3) NULL,
        disabled_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE admin_sessions (
        id BIGSERIAL PRIMARY KEY,
        token_hash CHAR(64) NOT NULL UNIQUE,
        admin_id BIGINT NOT NULL REFERENCES admins (id),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ(3) NOT NULL,
        revoked_at TIMESTAMPTZ(3) NULL
      )`,
      'CREATE INDEX idx_admin_sessions_admin ON admin_sessions (admin_id)',
    ],
  },
  {
    id: '007_alerts',
    sql: [
      `CREATE TABLE app_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users (id),
        endpoint VARCHAR(1024) NOT NULL UNIQUE,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_push_user ON push_subscriptions (user_id)',
      'ALTER TABLE users ADD COLUMN text_alerts BOOLEAN NOT NULL DEFAULT true',
      `CREATE TABLE alert_log (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users (id),
        kind VARCHAR(32) NOT NULL,
        channel VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        detail VARCHAR(255) NOT NULL,
        text VARCHAR(400) NOT NULL,
        message_id BIGINT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_alert_log_user ON alert_log (user_id, id)',
      `CREATE TABLE scheduled_alerts (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users (id),
        kind VARCHAR(32) NOT NULL,
        run_at TIMESTAMPTZ(3) NOT NULL,
        payload TEXT NOT NULL,
        done_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_scheduled_due ON scheduled_alerts (run_at) WHERE done_at IS NULL',
    ],
  },
  {
    id: '008_pets',
    sql: [
      `CREATE TABLE pets (
        id BIGSERIAL PRIMARY KEY,
        owner_id BIGINT NOT NULL REFERENCES users (id),
        kind VARCHAR(8) NOT NULL CHECK (kind IN ('cat', 'dog')),
        name VARCHAR(30) NOT NULL,
        birth_year SMALLINT NOT NULL,
        birth_month SMALLINT NOT NULL CHECK (birth_month BETWEEN 1 AND 12),
        breed VARCHAR(40) NULL,
        weight_kg NUMERIC(4, 1) NULL,
        vaccinated BOOLEAN NOT NULL,
        vaccine_year SMALLINT NULL,
        vaccine_month SMALLINT NULL CHECK (vaccine_month BETWEEN 1 AND 12),
        vaccine_photo VARCHAR(80) NULL,
        health_note VARCHAR(300) NOT NULL DEFAULT '',
        status VARCHAR(16) NOT NULL CHECK (status IN ('approved', 'pending', 'needs_info', 'rejected')),
        check_reasons VARCHAR(64) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CHECK (kind = 'cat' OR (breed IS NOT NULL AND weight_kg IS NOT NULL))
      )`,
      'CREATE INDEX idx_pets_owner ON pets (owner_id, id)',
    ],
  },
  {
    id: '009_pet_status',
    sql: ['ALTER TABLE pets ADD COLUMN admin_note VARCHAR(300) NULL'],
  },
  {
    id: '010_pet_check',
    // Pilot: one admin role with full access, so existing admins get the new Pet check page.
    sql: ["UPDATE admins SET pages = array_append(pages, 'pets') WHERE NOT ('pets' = ANY (pages))", 'CREATE INDEX idx_pets_check ON pets (status, updated_at)'],
  },
  {
    id: '011_addresses',
    sql: [
      `CREATE TABLE addresses (
        id BIGSERIAL PRIMARY KEY,
        owner_id BIGINT NOT NULL REFERENCES users (id),
        label VARCHAR(20) NOT NULL,
        area VARCHAR(40) NOT NULL,
        -- Street, unit, postcode and contacts, encrypted (AES-256-GCM, PDPA rule G8).
        secret TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        deleted_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_addresses_owner ON addresses (owner_id) WHERE deleted_at IS NULL',
      'CREATE UNIQUE INDEX uq_addresses_default ON addresses (owner_id) WHERE is_default AND deleted_at IS NULL',
    ],
  },
  {
    id: '012_caregiver_applications',
    sql: [
      `CREATE TABLE caregiver_applications (
        user_id BIGINT PRIMARY KEY REFERENCES users (id),
        status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'needs_info', 'approved', 'rejected')),
        full_name VARCHAR(80) NOT NULL DEFAULT '',
        -- IC number, encrypted (AES-256-GCM, rule R12-4); NULL until typed.
        ic_secret TEXT NULL,
        experience_years SMALLINT NULL,
        cats BOOLEAN NOT NULL DEFAULT false,
        dogs BOOLEAN NOT NULL DEFAULT false,
        max_dog_size VARCHAR(8) NULL CHECK (max_dog_size IN ('small', 'medium', 'large')),
        areas TEXT[] NOT NULL DEFAULT '{}',
        guide_version VARCHAR(20) NULL,
        admin_note VARCHAR(300) NULL,
        submitted_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_caregiver_applications_status ON caregiver_applications (status, submitted_at)',
      `CREATE TABLE caregiver_application_files (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES caregiver_applications (user_id),
        kind VARCHAR(16) NOT NULL CHECK (kind IN ('ic_front', 'ic_back', 'selfie', 'certificate', 'good_conduct')),
        file_key VARCHAR(80) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_caregiver_application_files_user ON caregiver_application_files (user_id)',
    ],
  },
  {
    id: '013_caregiver_review',
    sql: [
      // Keyed hash of the IC number, to find the same IC on two accounts without decrypting (R13-5).
      'ALTER TABLE caregiver_applications ADD COLUMN ic_hash VARCHAR(64) NULL',
      'CREATE INDEX idx_caregiver_applications_ic_hash ON caregiver_applications (ic_hash)',
      // Pilot: one admin role with full access, so existing admins get the new Caregiver review page.
      "UPDATE admins SET pages = array_append(pages, 'caregivers') WHERE NOT ('caregivers' = ANY (pages))",
    ],
  },
  {
    id: '014_caregiver_profiles',
    sql: [
      // The caregiver's live profile (S04), made from the approved application the first time it is opened.
      `CREATE TABLE caregiver_profiles (
        user_id BIGINT PRIMARY KEY REFERENCES users (id),
        display_name VARCHAR(80) NOT NULL,
        cats BOOLEAN NOT NULL,
        dogs BOOLEAN NOT NULL,
        max_dog_size VARCHAR(8) NULL CHECK (max_dog_size IN ('small', 'medium', 'large')),
        areas TEXT[] NOT NULL,
        experience_years SMALLINT NOT NULL,
        intro VARCHAR(300) NOT NULL DEFAULT '',
        photo_key VARCHAR(80) NULL,
        last_rejected VARCHAR(300) NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      // Changes that need an admin (R15-2): a larger dog ability and/or a new photo. One pending per caregiver.
      `CREATE TABLE caregiver_profile_changes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES caregiver_profiles (user_id),
        status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
        ability_dogs BOOLEAN NULL,
        ability_size VARCHAR(8) NULL CHECK (ability_size IN ('small', 'medium', 'large')),
        photo_key VARCHAR(80) NULL,
        admin_note VARCHAR(300) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        decided_at TIMESTAMPTZ(3) NULL
      )`,
      "CREATE UNIQUE INDEX uq_caregiver_profile_changes_pending ON caregiver_profile_changes (user_id) WHERE status = 'pending'",
      "CREATE INDEX idx_caregiver_profile_changes_waiting ON caregiver_profile_changes (created_at) WHERE status = 'pending'",
    ],
  },
  {
    id: '015_caregiver_schedule',
    sql: [
      "ALTER TABLE caregiver_profiles ADD COLUMN travel_buffer_min SMALLINT NOT NULL DEFAULT 30 CHECK (travel_buffer_min IN (15, 30, 45, 60))",
      "ALTER TABLE caregiver_profiles ADD COLUMN overtime_max_min SMALLINT NOT NULL DEFAULT 30 CHECK (overtime_max_min IN (0, 15, 30, 45, 60))",
      // "Not available" blocks (R16-1): one-off on a date, or weekly on a weekday. Minutes after midnight, KL time.
      `CREATE TABLE caregiver_blocks (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES caregiver_profiles (user_id),
        kind VARCHAR(8) NOT NULL CHECK (kind IN ('once', 'weekly')),
        block_date DATE NULL,
        weekday SMALLINT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_min SMALLINT NOT NULL,
        end_min SMALLINT NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CHECK ((kind = 'once' AND block_date IS NOT NULL) OR (kind = 'weekly' AND weekday IS NOT NULL)),
        CHECK (start_min < end_min)
      )`,
      'CREATE INDEX idx_caregiver_blocks_user ON caregiver_blocks (user_id)',
      // Booked visits on a caregiver's time (R16-4). Orders fill this from E6; until then the test tool adds them.
      `CREATE TABLE booked_visits (
        id BIGSERIAL PRIMARY KEY,
        caregiver_id BIGINT NOT NULL REFERENCES users (id),
        visit_date DATE NOT NULL,
        start_min SMALLINT NOT NULL,
        minutes SMALLINT NOT NULL CHECK (minutes > 0),
        label VARCHAR(80) NOT NULL,
        source VARCHAR(8) NOT NULL DEFAULT 'test' CHECK (source IN ('test', 'order')),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_booked_visits_caregiver ON booked_visits (caregiver_id, visit_date)',
    ],
  },
  {
    id: '016_caregiver_badges',
    sql: [
      // Badges owners see (R17-2): saved with the approval instead of only in the history note.
      'ALTER TABLE caregiver_applications ADD COLUMN id_checked BOOLEAN NOT NULL DEFAULT false',
      'ALTER TABLE caregiver_applications ADD COLUMN cert_checked BOOLEAN NOT NULL DEFAULT false',
      // Approval always needed the identity tick; the certificate tick is read back from the approval's history note.
      "UPDATE caregiver_applications SET id_checked = true WHERE status = 'approved'",
      `UPDATE caregiver_applications a SET cert_checked = true WHERE a.status = 'approved' AND EXISTS (
        SELECT 1 FROM status_history h WHERE h.entity = 'caregiver_application' AND h.entity_id = a.user_id
        AND h.to_status = 'approved' AND h.reason LIKE '%certificates checked%')`,
    ],
  },
  {
    id: '017_booking_drafts',
    sql: [
      // The owner's booking setup (O06, R18-4): one draft per owner, kept until it becomes an order (E5-4).
      `CREATE TABLE booking_drafts (
        owner_id BIGINT PRIMARY KEY REFERENCES users (id),
        pet_ids BIGINT[] NOT NULL DEFAULT '{}',
        level VARCHAR(8) NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'upgrade')),
        overtime_units SMALLINT NOT NULL DEFAULT 0 CHECK (overtime_units BETWEEN 0 AND 4),
        address_id BIGINT NULL REFERENCES addresses (id),
        -- [{date: 'YYYY-MM-DD', start: minutes after midnight}], sorted.
        visits JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
    ],
  },
  {
    id: '018_booking_caregiver',
    sql: [
      // The caregiver chosen on O07/O08 (R19-4), and why an earlier choice was cleared.
      'ALTER TABLE booking_drafts ADD COLUMN caregiver_id BIGINT NULL REFERENCES users (id)',
      'ALTER TABLE booking_drafts ADD COLUMN caregiver_note VARCHAR(200) NULL',
    ],
  },
  {
    id: '019_booking_entry',
    sql: [
      // How the caregiver gets in (R20-1); the instructions are encrypted (R20-3) and shown to the caregiver only after accepting.
      "ALTER TABLE booking_drafts ADD COLUMN entry_method VARCHAR(16) NULL CHECK (entry_method IN ('pre_authorised', 'live_confirm'))",
      'ALTER TABLE booking_drafts ADD COLUMN entry_secret TEXT NULL',
    ],
  },
  {
    id: '020_orders',
    sql: [
      // An order is made when the owner taps Pay (R21-4): prices, pets, visits and entry are copied and locked.
      `CREATE TABLE orders (
        id BIGSERIAL PRIMARY KEY,
        number VARCHAR(16) NOT NULL UNIQUE,
        owner_id BIGINT NOT NULL REFERENCES users (id),
        caregiver_id BIGINT NOT NULL REFERENCES users (id),
        status VARCHAR(20) NOT NULL CHECK (status IN ('awaiting_payment', 'pending_accept', 'cancelled')),
        level VARCHAR(8) NOT NULL,
        overtime_units SMALLINT NOT NULL,
        address_id BIGINT NOT NULL REFERENCES addresses (id),
        -- [{id, name, kind}] and [{date, start, label, quote}] as they were at payment.
        pets JSONB NOT NULL,
        visits JSONB NOT NULL,
        total_sen INTEGER NOT NULL CHECK (total_sen > 0),
        rules_version VARCHAR(20) NOT NULL,
        entry_method VARCHAR(16) NOT NULL,
        entry_secret TEXT NULL,
        health_confirmed_at TIMESTAMPTZ(3) NOT NULL,
        charge_id BIGINT NULL REFERENCES payments (id),
        attempts SMALLINT NOT NULL DEFAULT 0,
        paid_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_orders_owner ON orders (owner_id, id)',
      'CREATE INDEX idx_orders_caregiver ON orders (caregiver_id, status)',
    ],
  },
  {
    id: '021_order_result',
    sql: [
      // R22-4: a payment that lands with the first visit under 3 h away fails the order (full refund).
      'ALTER TABLE orders DROP CONSTRAINT orders_status_check',
      "ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('awaiting_payment', 'pending_accept', 'cancelled', 'failed'))",
      // R22-1: set once when payment lands (rule 2.x: never re-classified).
      'ALTER TABLE orders ADD COLUMN accept_deadline TIMESTAMPTZ(3) NULL',
      'ALTER TABLE orders ADD COLUMN accept_kind VARCHAR(8) NULL',
    ],
  },
  {
    id: '022_promo_codes',
    sql: [
      // E5-6 (round 23): codes are turned off, never deleted.
      `CREATE TABLE promo_codes (
        id BIGSERIAL PRIMARY KEY,
        code VARCHAR(16) NOT NULL UNIQUE,
        kind VARCHAR(8) NOT NULL CHECK (kind IN ('amount', 'percent')),
        amount_sen INTEGER NULL,
        percent SMALLINT NULL,
        max_sen INTEGER NULL,
        min_spend_sen INTEGER NOT NULL DEFAULT 0,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        total_uses INTEGER NULL,
        once_per_owner BOOLEAN NOT NULL DEFAULT false,
        first_order_only BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      // One row per order: reserved at Pay, used when paid, returned on cancel / fail / full refund (R23-4).
      `CREATE TABLE promo_uses (
        id BIGSERIAL PRIMARY KEY,
        promo_id BIGINT NOT NULL REFERENCES promo_codes (id),
        order_id BIGINT NOT NULL UNIQUE REFERENCES orders (id),
        owner_id BIGINT NOT NULL REFERENCES users (id),
        status VARCHAR(10) NOT NULL CHECK (status IN ('reserved', 'used', 'returned')),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_promo_uses_promo ON promo_uses (promo_id, status)',
      'ALTER TABLE booking_drafts ADD COLUMN promo_code VARCHAR(16) NULL',
      'ALTER TABLE orders ADD COLUMN promo_id BIGINT NULL REFERENCES promo_codes (id)',
      'ALTER TABLE orders ADD COLUMN discount_sen INTEGER NOT NULL DEFAULT 0',
      "UPDATE admins SET pages = array_append(pages, 'promos') WHERE NOT ('promos' = ANY (pages))",
    ],
  },
  {
    id: '023_referrals',
    sql: [
      // E5-7 (round 24): a personal invite code, made when the owner first opens the invite card.
      'ALTER TABLE users ADD COLUMN invite_code VARCHAR(8) NULL UNIQUE',
      // Only a brand-new account can be a friend, and only once.
      `CREATE TABLE referrals (
        id BIGSERIAL PRIMARY KEY,
        inviter_id BIGINT NOT NULL REFERENCES users (id),
        friend_id BIGINT NOT NULL UNIQUE REFERENCES users (id),
        order_id BIGINT NULL REFERENCES orders (id),
        rewarded_at TIMESTAMPTZ(3) NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        CHECK (inviter_id <> friend_id)
      )`,
      'CREATE INDEX idx_referrals_inviter ON referrals (inviter_id)',
      // Credit comes in grants that expire; spending takes from the soonest expiry first.
      `CREATE TABLE credit_grants (
        id BIGSERIAL PRIMARY KEY,
        owner_id BIGINT NOT NULL REFERENCES users (id),
        amount_sen INTEGER NOT NULL CHECK (amount_sen > 0),
        remaining_sen INTEGER NOT NULL CHECK (remaining_sen >= 0),
        expires_on DATE NOT NULL,
        referral_id BIGINT NULL REFERENCES referrals (id),
        reason VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        UNIQUE (referral_id, owner_id)
      )`,
      'CREATE INDEX idx_credit_grants_owner ON credit_grants (owner_id, expires_on)',
      // Held at Pay, spent when paid, returned on cancel / fail / refund (as credit, never cash).
      `CREATE TABLE credit_spends (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders (id),
        grant_id BIGINT NOT NULL REFERENCES credit_grants (id),
        amount_sen INTEGER NOT NULL CHECK (amount_sen > 0),
        status VARCHAR(10) NOT NULL CHECK (status IN ('held', 'spent', 'returned')),
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX idx_credit_spends_order ON credit_spends (order_id)',
      'ALTER TABLE orders ADD COLUMN credit_sen INTEGER NOT NULL DEFAULT 0',
      // Until settlement is built (E8/E9), a test tool sets this.
      'ALTER TABLE orders ADD COLUMN settled_at TIMESTAMPTZ(3) NULL',
    ],
  },
  {
    id: '024_accept_reject',
    sql: [
      // E6-2 (round 26): the caregiver accepts the whole order (Booked) or says no (failed, full refund).
      'ALTER TABLE orders DROP CONSTRAINT orders_status_check',
      "ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('awaiting_payment', 'pending_accept', 'accepted', 'cancelled', 'failed'))",
      'ALTER TABLE orders ADD COLUMN accepted_at TIMESTAMPTZ(3) NULL',
      "ALTER TABLE orders ADD COLUMN end_reason VARCHAR(10) NULL CHECK (end_reason IN ('too_late', 'rejected', 'timeout'))",
      "UPDATE orders SET end_reason = 'too_late' WHERE status = 'failed' AND accept_deadline IS NULL",
      // Never shown to the owner (R26-5).
      'ALTER TABLE orders ADD COLUMN reject_reason VARCHAR(10) NULL',
      // Accepted visits are locked in the caregiver's schedule (R26-3, R16-4).
      'ALTER TABLE booked_visits ADD COLUMN order_id BIGINT NULL REFERENCES orders (id)',
      'CREATE INDEX idx_booked_visits_order ON booked_visits (order_id)',
    ],
  },
  {
    id: '025_withdraw',
    sql: [
      // E6-4 (round 28): the owner withdraws a paid order before the caregiver accepts (cancelled + withdrawn, full refund).
      'ALTER TABLE orders DROP CONSTRAINT orders_end_reason_check',
      "ALTER TABLE orders ADD CONSTRAINT orders_end_reason_check CHECK (end_reason IN ('too_late', 'rejected', 'timeout', 'withdrawn'))",
    ],
  },
  {
    id: '026_visit_runs',
    sql: [
      // E8-3 (round 35): each visit of an accepted order has its own status; no row yet = To do.
      `CREATE TABLE visit_runs (
        order_id BIGINT NOT NULL REFERENCES orders (id),
        idx SMALLINT NOT NULL,
        status VARCHAR(12) NOT NULL CHECK (status IN ('arrived', 'in_service')),
        arrived_at TIMESTAMPTZ(3) NOT NULL,
        entered_at TIMESTAMPTZ(3) NULL,
        entered_by VARCHAR(10) NULL CHECK (entered_by IN ('caregiver', 'owner')),
        updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        PRIMARY KEY (order_id, idx)
      )`,
    ],
  },
  {
    id: '027_visit_service',
    sql: [
      // E8-4 (round 36): the checklist ticks and photos of a visit while it is in service.
      `CREATE TABLE visit_checks (
        order_id BIGINT NOT NULL REFERENCES orders (id),
        idx SMALLINT NOT NULL,
        item VARCHAR(10) NOT NULL CHECK (item IN ('feed', 'water', 'litter', 'walk')),
        done_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
        PRIMARY KEY (order_id, idx, item)
      )`,
      `CREATE TABLE visit_photos (
        id BIGSERIAL PRIMARY KEY,
        order_id BIGINT NOT NULL REFERENCES orders (id),
        idx SMALLINT NOT NULL,
        file_key VARCHAR(80) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
      )`,
      'CREATE INDEX visit_photos_visit ON visit_photos (order_id, idx)',
    ],
  },
];
