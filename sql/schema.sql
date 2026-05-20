-- Valhalla Barbearia - Supabase Schema
-- Execute este SQL no SQL Editor do Supabase (owkvgdjcobmuacnztzee)
-- Tabelas com prefixo valhalla_ para isolamento no mesmo banco

-- Tabela de servicos
create table valhalla_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_minutes int not null,
  interval_minutes int not null default 10,
  price decimal(10,2),
  price_note text
);

-- Servicos reais da Valhalla Barbearia
insert into valhalla_services (name, duration_minutes, interval_minutes, price, price_note) values
  ('Corte',             30, 10, 35.00, 'Pix ou Dinheiro'),
  ('Barba',             30, 10, 35.00, 'Pix ou Dinheiro'),
  ('Combo Corte+Barba', 60, 10, 60.00, 'Pix ou Dinheiro'),
  ('Sobrancelha',       15, 5,  15.00, 'Pix ou Dinheiro'),
  ('Hidratacao',        20, 5,  15.00, 'Pix ou Dinheiro'),
  ('Relaxamento',       40, 10, 40.00, 'Pix ou Dinheiro'),
  ('Pe do Cabelo',      10, 5,   7.00, 'Pix ou Dinheiro'),
  ('Corte Maquina',     20, 5,  20.00, 'Pix ou Dinheiro');

-- Blocos de disponibilidade (admin define por dia)
create table valhalla_availability (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);

-- Agendamentos
create table valhalla_appointments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references valhalla_services(id),
  date date not null,
  start_time time not null,
  end_time time not null,
  client_name text not null,
  client_phone text not null,
  status text default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  cancelled_by_client boolean default false,
  created_at timestamptz default now()
);

-- Config admin (senha)
create table valhalla_admin_config (
  id int primary key default 1 check (id = 1),
  password_hash text not null
);

-- Senha padrao: "admin123" (TROQUE DEPOIS via painel!)
insert into valhalla_admin_config (password_hash) values
  ('240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- Clientes (fidelidade)
create table valhalla_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,
  pin_hash text,
  loyalty_stamps int default 0,
  loyalty_redeemed int default 0,
  total_visits int default 0,
  unseen_completions int default 0,
  haircut_frequency_days int,
  last_completed_at timestamptz,
  created_at timestamptz default now()
);

-- RLS
alter table valhalla_services enable row level security;
alter table valhalla_availability enable row level security;
alter table valhalla_appointments enable row level security;
alter table valhalla_admin_config enable row level security;
alter table valhalla_clients enable row level security;

-- Policies
create policy "valhalla_services_read" on valhalla_services for select using (true);
create policy "valhalla_availability_read" on valhalla_availability for select using (true);
create policy "valhalla_appointments_read" on valhalla_appointments for select using (true);
create policy "valhalla_appointments_insert" on valhalla_appointments for insert with check (true);
create policy "valhalla_admin_config_deny" on valhalla_admin_config for select using (false);
create policy "valhalla_clients_read" on valhalla_clients for select using (true);

-- Funcao: verificar senha admin
create or replace function valhalla_verify_admin_password(pwd text)
returns boolean
language plpgsql security definer
as $$
declare
  stored_hash text;
begin
  select password_hash into stored_hash from valhalla_admin_config where id = 1;
  return stored_hash = encode(sha256(pwd::bytea), 'hex');
end;
$$;

-- Alias sem prefixo para compatibilidade com o JS (que chama verify_admin_password)
create or replace function verify_admin_password(pwd text)
returns boolean
language plpgsql security definer
as $$
begin
  return valhalla_verify_admin_password(pwd);
end;
$$;

-- Funcao: gerenciar disponibilidade (admin)
create or replace function admin_manage_availability(
  pwd text,
  action text,
  av_id uuid default null,
  av_date date default null,
  av_start time default null,
  av_end time default null
)
returns json
language plpgsql security definer
as $$
declare
  result json;
begin
  if not valhalla_verify_admin_password(pwd) then
    return json_build_object('error', 'Senha incorreta');
  end if;

  case action
    when 'insert' then
      insert into valhalla_availability (date, start_time, end_time)
      values (av_date, av_start, av_end)
      returning json_build_object('id', id, 'date', date, 'start_time', start_time, 'end_time', end_time) into result;
    when 'delete' then
      delete from valhalla_availability where id = av_id;
      result := json_build_object('deleted', av_id);
    else
      result := json_build_object('error', 'Acao invalida');
  end case;

  return result;
end;
$$;

-- Funcao: cancelar agendamento (admin)
create or replace function admin_cancel_appointment(pwd text, apt_id uuid)
returns json
language plpgsql security definer
as $$
begin
  if not valhalla_verify_admin_password(pwd) then
    return json_build_object('error', 'Senha incorreta');
  end if;

  update valhalla_appointments set status = 'cancelled' where id = apt_id;
  return json_build_object('cancelled', apt_id);
end;
$$;

-- Funcao: completar agendamento (admin) + fidelidade
create or replace function admin_complete_appointment(pwd text, apt_id uuid)
returns json
language plpgsql security definer
as $$
declare
  apt_record record;
  client_record record;
  new_stamps int;
  card_complete boolean := false;
begin
  if not valhalla_verify_admin_password(pwd) then
    return json_build_object('error', 'Senha incorreta');
  end if;

  select * into apt_record from valhalla_appointments where id = apt_id and status = 'confirmed';
  if apt_record is null then
    return json_build_object('error', 'Agendamento nao encontrado ou ja finalizado');
  end if;

  update valhalla_appointments set status = 'completed' where id = apt_id;

  -- Upsert client
  insert into valhalla_clients (name, phone, loyalty_stamps, total_visits, unseen_completions, last_completed_at)
  values (apt_record.client_name, apt_record.client_phone, 1, 1, 1, now())
  on conflict (phone) do update set
    loyalty_stamps = valhalla_clients.loyalty_stamps + 1,
    total_visits = valhalla_clients.total_visits + 1,
    unseen_completions = valhalla_clients.unseen_completions + 1,
    last_completed_at = now();

  select * into client_record from valhalla_clients where phone = apt_record.client_phone;
  new_stamps := client_record.loyalty_stamps;

  if new_stamps >= 10 then
    update valhalla_clients set
      loyalty_stamps = 0,
      loyalty_redeemed = loyalty_redeemed + 1,
      unseen_completions = unseen_completions
    where phone = apt_record.client_phone;
    card_complete := true;
    new_stamps := 0;
  end if;

  return json_build_object('stamps', new_stamps, 'card_complete', card_complete);
end;
$$;

-- Funcao: alterar senha (admin)
create or replace function admin_change_password(old_pwd text, new_pwd text)
returns json
language plpgsql security definer
as $$
begin
  if not valhalla_verify_admin_password(old_pwd) then
    return json_build_object('error', 'Senha atual incorreta');
  end if;

  update valhalla_admin_config set password_hash = encode(sha256(new_pwd::bytea), 'hex') where id = 1;
  return json_build_object('success', true);
end;
$$;

-- Funcao: cliente cancelar agendamento (max 1 vez por telefone)
create or replace function client_cancel_appointment(apt_id uuid, phone text)
returns json
language plpgsql security definer
as $$
declare
  cancel_count int;
  apt_record record;
begin
  select * into apt_record from valhalla_appointments
    where id = apt_id and client_phone = phone and status = 'confirmed';

  if apt_record is null then
    return json_build_object('error', 'Agendamento nao encontrado ou ja cancelado');
  end if;

  select count(*) into cancel_count from valhalla_appointments
    where client_phone = phone and cancelled_by_client = true;

  if cancel_count >= 1 then
    return json_build_object('error', 'Limite de cancelamento atingido. Voce so pode cancelar 1 vez.');
  end if;

  update valhalla_appointments set status = 'cancelled', cancelled_by_client = true
    where id = apt_id;

  return json_build_object('success', true, 'message', 'Agendamento cancelado com sucesso');
end;
$$;

-- Funcao: marcar completions como vistas
create or replace function mark_completions_seen(p_phone text)
returns void
language plpgsql security definer
as $$
begin
  update valhalla_clients set unseen_completions = 0 where phone = p_phone;
end;
$$;

-- Funcao: definir frequencia de corte
create or replace function set_haircut_frequency(p_phone text, p_days int)
returns void
language plpgsql security definer
as $$
begin
  update valhalla_clients set haircut_frequency_days = p_days where phone = p_phone;
end;
$$;

-- Funcao: registrar cliente
create or replace function register_client(p_name text, p_phone text, p_pin text)
returns json
language plpgsql security definer
as $$
declare
  existing record;
  new_client record;
begin
  select * into existing from valhalla_clients where phone = p_phone;
  if existing is not null and existing.pin_hash is not null then
    return json_build_object('error', 'Telefone ja cadastrado');
  end if;

  if existing is not null then
    update valhalla_clients set name = p_name, pin_hash = encode(sha256(p_pin::bytea), 'hex') where phone = p_phone;
  else
    insert into valhalla_clients (name, phone, pin_hash) values (p_name, p_phone, encode(sha256(p_pin::bytea), 'hex'));
  end if;

  select * into new_client from valhalla_clients where phone = p_phone;
  return json_build_object('client', row_to_json(new_client));
end;
$$;

-- Funcao: login cliente
create or replace function login_client(p_phone text, p_pin text)
returns json
language plpgsql security definer
as $$
declare
  client_record record;
begin
  select * into client_record from valhalla_clients
    where phone = p_phone and pin_hash = encode(sha256(p_pin::bytea), 'hex');

  if client_record is null then
    return json_build_object('error', 'Telefone ou PIN incorreto');
  end if;

  return json_build_object('client', row_to_json(client_record));
end;
$$;
