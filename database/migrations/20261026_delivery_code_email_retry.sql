-- Preserve the customer code encrypted for provider retries and authorized admin display.
ALTER TABLE delivery_attempts ADD COLUMN IF NOT EXISTS code_ciphertext TEXT;
