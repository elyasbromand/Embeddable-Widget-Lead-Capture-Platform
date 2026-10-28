export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE widgets (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      public_id   text        NOT NULL UNIQUE, -- UNIQUE creates the index used by config/submission lookups
      owner_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        text        NOT NULL CHECK (type IN ('signup', 'contact')),
      title       text        NOT NULL,
      description text,                        -- optional: a widget may have no description
      button_text text        NOT NULL,
      fields      jsonb       NOT NULL,
      display     jsonb       NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );

    -- "list my widgets"; also makes ON DELETE CASCADE from users fast
    CREATE INDEX widgets_owner_id_idx ON widgets (owner_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE widgets;`); // drops its indexes too
};
