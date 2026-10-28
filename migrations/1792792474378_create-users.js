export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      email         text        NOT NULL UNIQUE CHECK (email = lower(email)),
      password_hash text        NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP TABLE users;`);
};
