-- Valhalla Barbearia - Migration v3: Barbeiros + Horario semanal + Folgas
-- Execute no SQL Editor do Supabase (owkvgdjcobmuacnztzee)
-- IMPORTANTE: rodar DEPOIS do schema.sql e migration-v1

-- 1. Tabela de barbeiros
CREATE TABLE IF NOT EXISTS valhalla_barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. Horario semanal POR BARBEIRO
-- day_of_week: 0=Domingo, 1=Segunda, ..., 6=Sabado
CREATE TABLE IF NOT EXISTS valhalla_schedule (
  barber_id uuid NOT NULL REFERENCES valhalla_barbers(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working boolean DEFAULT false,
  start_time time,
  end_time time,
  PRIMARY KEY (barber_id, day_of_week)
);

-- 3. Folgas POR BARBEIRO
CREATE TABLE IF NOT EXISTS valhalla_days_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES valhalla_barbers(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (barber_id, date)
);

-- 4. Adicionar barber_id nos agendamentos
ALTER TABLE valhalla_appointments ADD COLUMN IF NOT EXISTS barber_id uuid REFERENCES valhalla_barbers(id);

-- RLS
ALTER TABLE valhalla_barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE valhalla_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE valhalla_days_off ENABLE ROW LEVEL SECURITY;

-- Leitura publica
CREATE POLICY "valhalla_barbers_read" ON valhalla_barbers FOR SELECT USING (true);
CREATE POLICY "valhalla_schedule_read" ON valhalla_schedule FOR SELECT USING (true);
CREATE POLICY "valhalla_days_off_read" ON valhalla_days_off FOR SELECT USING (true);

-- 5. Funcao admin: gerenciar barbeiros
CREATE OR REPLACE FUNCTION admin_manage_barber(
  pwd text,
  action text,
  b_id uuid DEFAULT NULL,
  b_name text DEFAULT NULL,
  b_photo_url text DEFAULT NULL,
  b_active boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result json;
  new_barber_id uuid;
BEGIN
  IF NOT valhalla_verify_admin_password(pwd) THEN
    RETURN json_build_object('error', 'Senha incorreta');
  END IF;

  CASE action
    WHEN 'insert' THEN
      INSERT INTO valhalla_barbers (name, photo_url, active)
      VALUES (b_name, b_photo_url, b_active)
      RETURNING id INTO new_barber_id;

      -- Criar horario padrao Seg-Sab 09:00-19:00
      INSERT INTO valhalla_schedule (barber_id, day_of_week, is_working, start_time, end_time)
      VALUES
        (new_barber_id, 0, false, NULL, NULL),
        (new_barber_id, 1, true, '09:00', '19:00'),
        (new_barber_id, 2, true, '09:00', '19:00'),
        (new_barber_id, 3, true, '09:00', '19:00'),
        (new_barber_id, 4, true, '09:00', '19:00'),
        (new_barber_id, 5, true, '09:00', '19:00'),
        (new_barber_id, 6, true, '09:00', '19:00');

      result := json_build_object('id', new_barber_id, 'name', b_name);
    WHEN 'update' THEN
      UPDATE valhalla_barbers SET
        name = COALESCE(b_name, name),
        photo_url = COALESCE(b_photo_url, photo_url),
        active = COALESCE(b_active, active)
      WHERE id = b_id;
      result := json_build_object('updated', b_id);
    WHEN 'delete' THEN
      DELETE FROM valhalla_barbers WHERE id = b_id;
      result := json_build_object('deleted', b_id);
    ELSE
      result := json_build_object('error', 'Acao invalida');
  END CASE;

  RETURN result;
END;
$$;

-- 6. Funcao admin: atualizar horario de um dia (por barbeiro)
CREATE OR REPLACE FUNCTION admin_update_schedule(
  pwd text,
  p_barber_id uuid,
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

  INSERT INTO valhalla_schedule (barber_id, day_of_week, is_working, start_time, end_time)
  VALUES (p_barber_id, p_day, p_working,
    CASE WHEN p_working THEN p_start ELSE NULL END,
    CASE WHEN p_working THEN p_end ELSE NULL END)
  ON CONFLICT (barber_id, day_of_week) DO UPDATE SET
    is_working = EXCLUDED.is_working,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time;

  RETURN json_build_object('success', true);
END;
$$;

-- 7. Funcao admin: gerenciar folgas (por barbeiro)
CREATE OR REPLACE FUNCTION admin_manage_day_off(
  pwd text,
  action text,
  p_barber_id uuid DEFAULT NULL,
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
      INSERT INTO valhalla_days_off (barber_id, date, reason)
      VALUES (p_barber_id, p_date, p_reason)
      ON CONFLICT (barber_id, date) DO NOTHING
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
