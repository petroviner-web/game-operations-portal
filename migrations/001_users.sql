-- Authentication behavior is deliberately deferred to milestone 2.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND length(email_normalized) BETWEEN 3 AND 254
  )
);
