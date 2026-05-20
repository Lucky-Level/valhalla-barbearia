-- Valhalla Barbearia - Migration: adicionar coluna price e inserir servicos reais
-- Execute no SQL Editor do Supabase (owkvgdjcobmuacnztzee)

-- 1. Adicionar coluna price (decimal) na tabela de servicos
ALTER TABLE valhalla_services ADD COLUMN IF NOT EXISTS price decimal(10,2);

-- 2. Limpar servicos antigos (seed generico)
DELETE FROM valhalla_services;

-- 3. Inserir os 8 servicos reais da Valhalla Barbearia
INSERT INTO valhalla_services (name, duration_minutes, interval_minutes, price, price_note) VALUES
  ('Corte',             30, 10, 35.00, 'Pix ou Dinheiro'),
  ('Barba',             30, 10, 35.00, 'Pix ou Dinheiro'),
  ('Combo Corte+Barba', 60, 10, 60.00, 'Pix ou Dinheiro'),
  ('Sobrancelha',       15, 5,  15.00, 'Pix ou Dinheiro'),
  ('Hidratacao',        20, 5,  15.00, 'Pix ou Dinheiro'),
  ('Relaxamento',       40, 10, 40.00, 'Pix ou Dinheiro'),
  ('Pe do Cabelo',      10, 5,   7.00, 'Pix ou Dinheiro'),
  ('Corte Maquina',     20, 5,  20.00, 'Pix ou Dinheiro');
