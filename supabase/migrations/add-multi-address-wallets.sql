-- Multi-address wallets: one label, up to 4 chain-family addresses
-- EVM (address), Solana, Tron, Bitcoin

-- Make EVM address nullable (Solana/Tron/BTC-only wallets allowed)
ALTER TABLE wallets ALTER COLUMN address DROP NOT NULL;

-- Secondary address columns
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS solana_address TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS tron_address TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS bitcoin_address TEXT;

-- Drop old unique constraint if present (name may vary)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'wallets'::regclass
      AND contype = 'u'
      AND conname = 'wallets_user_id_address_key'
  ) THEN
    ALTER TABLE wallets DROP CONSTRAINT wallets_user_id_address_key;
  END IF;
END $$;

-- At least one address required
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_at_least_one_address;
ALTER TABLE wallets ADD CONSTRAINT wallets_at_least_one_address CHECK (
  address IS NOT NULL
  OR solana_address IS NOT NULL
  OR tron_address IS NOT NULL
  OR bitcoin_address IS NOT NULL
);

-- Partial unique indexes per address family
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_evm_address_uidx
  ON wallets (user_id, address)
  WHERE address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_solana_address_uidx
  ON wallets (user_id, solana_address)
  WHERE solana_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_tron_address_uidx
  ON wallets (user_id, tron_address)
  WHERE tron_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_bitcoin_address_uidx
  ON wallets (user_id, bitcoin_address)
  WHERE bitcoin_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallets_solana_address ON wallets (solana_address)
  WHERE solana_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_tron_address ON wallets (tron_address)
  WHERE tron_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_bitcoin_address ON wallets (bitcoin_address)
  WHERE bitcoin_address IS NOT NULL;
