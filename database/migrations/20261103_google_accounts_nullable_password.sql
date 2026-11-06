-- Google OAuth accounts authenticate with verified Google ID tokens and do not
-- have a local password. Local account registration continues to hash passwords.
ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL;
