-- Valhalla Barbearia v2 - Products & Orders
-- Execute no SQL Editor do Supabase (owkvgdjcobmuacnztzee)

-- Tabela de produtos
create table valhalla_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price decimal(10,2) not null,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Encomendas de produtos
create table valhalla_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references valhalla_products(id),
  client_name text not null,
  client_phone text not null,
  status text default 'pending' check (status in ('pending', 'paid', 'delivered', 'cancelled')),
  notes text,
  created_at timestamptz default now()
);

-- RLS
alter table valhalla_products enable row level security;
alter table valhalla_orders enable row level security;

-- Products: public read
create policy "valhalla_products_read" on valhalla_products for select using (true);

-- Orders: public insert + read
create policy "valhalla_orders_insert" on valhalla_orders for insert with check (true);
create policy "valhalla_orders_read" on valhalla_orders for select using (true);

-- Funcao: admin gerenciar produtos
create or replace function admin_manage_product(
  pwd text,
  action text,
  p_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_price decimal default null,
  p_image_url text default null,
  p_active boolean default true
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
      insert into valhalla_products (name, description, price, image_url, active)
      values (p_name, p_description, p_price, p_image_url, p_active)
      returning json_build_object('id', id, 'name', name) into result;
    when 'update' then
      update valhalla_products set
        name = coalesce(p_name, name),
        description = coalesce(p_description, description),
        price = coalesce(p_price, price),
        image_url = coalesce(p_image_url, image_url),
        active = coalesce(p_active, active)
      where id = p_id;
      result := json_build_object('updated', p_id);
    when 'delete' then
      delete from valhalla_products where id = p_id;
      result := json_build_object('deleted', p_id);
    else
      result := json_build_object('error', 'Acao invalida');
  end case;

  return result;
end;
$$;

-- Funcao: admin gerenciar orders
create or replace function admin_manage_order(
  pwd text,
  action text,
  o_id uuid,
  o_status text default null
)
returns json
language plpgsql security definer
as $$
begin
  if not valhalla_verify_admin_password(pwd) then
    return json_build_object('error', 'Senha incorreta');
  end if;

  case action
    when 'update_status' then
      update valhalla_orders set status = o_status where id = o_id;
    when 'delete' then
      delete from valhalla_orders where id = o_id;
    else
      return json_build_object('error', 'Acao invalida');
  end case;

  return json_build_object('success', true);
end;
$$;
