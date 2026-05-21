-- Valhalla Barbearia - Migration: Horario semanal fixo + folgas
-- Execute no SQL Editor do Supabase (owkvgdjcobmuacnztzee)

-- 1. Tabela de horario semanal (1 linha por dia da semana)
-- day_of_week: 0=Domingo, 1=Segunda, 2=Terca, ..., 6=Sabado
CREATE TABLE IF NOT EXISTS valhalla_schedule (
  day_of_week int PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_working boolean DEFAULT false,
  start_time time,
  end_time time
);

-- Seed: Seg-Sab 09:00-19:00, Domingo folga
INSERT INTO valhalla_schedule (day_of_week, is_working, start_time, end_time) VALUES
  (0, false, NULL, NULL),        -- Domingo (folga)
  (1, true, '09:00', '19:00'),   -- Segunda
  (2, true, '09:00', '19:00'),   -- Terca
  (3, true, '09:00', '19:00'),   -- Quarta
  (4, true, '09:00', '19:00'),   -- Quinta
  (5, true, '09:00', '19:00'),   -- Sexta
  (6, true, '09:00', '19:00')    -- Sabado
ON CONFLICT (day_of_week) DO NOTHING;

-- 2. Tabela de folgas (dias especificos que nao trabalha)
CREATE TABLE IF NOT EXISTS valhalla_days_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE valhalla_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE valhalla_days_off ENABLE ROW LEVEL SECURITY;

-- Leitura publica (cliente precisa ver pra montar o calendario)
CREATE POLICY "valhalla_schedule_read" ON valhalla_schedule FOR SELECT USING (true);
CREATE POLICY "valhalla_days_off_read" ON valhalla_days_off FOR SELECT USING (true);

-- 3. Funcao admin: atualizar horario de um dia da semana
CREATE OR REPLACE FUNCTION admin_update_schedule(
  pwd text,
  p_day int,
  p_working boolean,
  p_start time DEFAULT NULL,
  p_end time DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT valhalla_verify_admin_password(pwd) THEN
    RETURN json_build_object('error', 'Senha incorreta');
  END IF;

  UPDATE valhalla_schedule
  SET is_working = p_working,
      start_time = CASE WHEN p_working THEN p_start ELSE NULL END,
      end_time = CASE WHEN p_working THEN p_end ELSE NULL END
  WHERE day_of_week = p_day;

  RETURN json_build_object('success', true);
END;
$$;

-- 4. Funcao admin: adicionar/remover folga
CREATE OR REPLACE FUNCTION admin_manage_day_off(
  pwd text,
  action text,
  p_date date DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  IF NOT valhalla_verify_admin_password(pwd) THEN
    RETURN json_build_object('error', 'Senha incorreta');
  END IF;

  CASE action
    WHEN 'insert' THEN
      INSERT INTO valhalla_days_off (date, reason)
      VALUES (p_date, p_reason)
      ON CONFLICT (date) DO NOTHING
      RETURNING json_build_object('id', id, 'date', date) INTO result;
      IF result IS NULL THEN
        result := json_build_object('info', 'Folga ja cadastrada');
      END IF;
    WHEN 'delete' THEN
      DELETE FROM valhalla_days_off WHERE id = p_id;
      result := json_build_object('deleted', p_id);
    ELSE
      result := json_build_object('error', 'Acao invalida');
  END CASE;

  RETURN result;
END;
$$;
