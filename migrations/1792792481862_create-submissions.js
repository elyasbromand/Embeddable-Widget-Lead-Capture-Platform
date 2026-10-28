export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE submissions (
      id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      widget_id       uuid        NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
      owner_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- copied from the widget row
      data            jsonb       NOT NULL,
      ip              inet,                    -- nullable: the retention job sets it to NULL after 90 days
      geo             jsonb,                   -- nullable: NULL when every geo provider fails
      idempotency_key text,                    -- nullable: clients may not send one
      created_at      timestamptz NOT NULL DEFAULT now()
    );

    -- submissions for one widget, newest first
    CREATE INDEX submissions_widget_id_created_at_idx ON submissions (widget_id, created_at);

    -- dashboard stats per owner
    CREATE INDEX submissions_owner_id_created_at_idx ON submissions (owner_id, created_at);

    -- a retried submit stores one row per widget. NULLs are distinct by default, so rows
    -- without a key never collide with each other.
    CREATE UNIQUE INDEX submissions_widget_id_idempotency_key_idx
      ON submissions (widget_id, idempotency_key);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE submissions;`);
};
