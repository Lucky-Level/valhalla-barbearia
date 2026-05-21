-- Valhalla Barbearia - Migration: Follow-up automatico
-- Execute no SQL Editor do Supabase (owkvgdjcobmuacnztzee)

-- 1. Adicionar next_followup_date na tabela de clientes
ALTER TABLE valhalla_clients ADD COLUMN IF NOT EXISTS next_followup_date date;
ALTER TABLE valhalla_clients ADD COLUMN IF NOT EXISTS last_followup_sent_at timestamptz;

-- 2. Funcao que recalcula next_followup_date quando:
--    - Um appointment e concluido (complete)
--    - A frequencia e definida/alterada
CREATE OR REPLACE FUNCTION valhalla_update_followup_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- So calcula se tem frequencia definida E tem ultima visita
  IF NEW.haircut_frequency_days IS NOT NULL AND NEW.last_completed_at IS NOT NULL THEN
    NEW.next_followup_date := (NEW.last_completed_at::date) + (NEW.haircut_frequency_days || ' days')::interval;
    -- Limpa o sent_at pra permitir novo envio no proximo ciclo
    NEW.last_followup_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger no UPDATE da tabela clients
DROP TRIGGER IF EXISTS trg_valhalla_update_followup ON valhalla_clients;
CREATE TRIGGER trg_valhalla_update_followup
  BEFORE UPDATE ON valhalla_clients
  FOR EACH ROW
  WHEN (
    OLD.last_completed_at IS DISTINCT FROM NEW.last_completed_at
    OR OLD.haircut_frequency_days IS DISTINCT FROM NEW.haircut_frequency_days
  )
  EXECUTE FUNCTION valhalla_update_followup_date();

-- 3. Atualizar todos os clientes existentes que ja tem frequencia
UPDATE valhalla_clients
SET next_followup_date = (last_completed_at::date) + (haircut_frequency_days || ' days')::interval
WHERE haircut_frequency_days IS NOT NULL
  AND last_completed_at IS NOT NULL
  AND next_followup_date IS NULL;

-- 4. View de follow-ups pendentes (para o admin consultar facilmente)
CREATE OR REPLACE VIEW valhalla_followups_due AS
SELECT
  id,
  name,
  phone,
  haircut_frequency_days,
  last_completed_at,
  next_followup_date,
  last_followup_sent_at,
  loyalty_stamps,
  total_visits,
  (CURRENT_DATE - last_completed_at::date) AS days_since_last,
  (CURRENT_DATE - next_followup_date) AS days_overdue
FROM valhalla_clients
WHERE next_followup_date IS NOT NULL
  AND next_followup_date <= CURRENT_DATE
  AND (last_followup_sent_at IS NULL OR last_followup_sent_at < next_followup_date::timestamptz)
ORDER BY next_followup_date ASC;

-- 5. Funcao RPC pra marcar follow-up como enviado
CREATE OR REPLACE FUNCTION valhalla_mark_followup_sent(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE valhalla_clients
  SET last_followup_sent_at = now()
  WHERE id = p_client_id;
END;
$$;

-- 6. Funcao de contagem rapida (pra badge no admin)
CREATE OR REPLACE FUNCTION valhalla_count_followups_due()
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::int FROM valhalla_followups_due;
$$;
