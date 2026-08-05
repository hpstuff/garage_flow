-- 0017_bgn_to_eur.sql
-- Migrate all existing rows from BGN to EUR as the sole supported currency.
-- Numeric values (amount, unit_price) are unchanged — only the label flips.

UPDATE line_item SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE line_item ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE invoice SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE invoice ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE invoice_line SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE invoice_line ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE payment SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE payment ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE credit_note SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE credit_note ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE credit_note_line SET currency = 'EUR' WHERE currency = 'BGN';
ALTER TABLE credit_note_line ALTER COLUMN currency SET DEFAULT 'EUR';
