-- Criar bucket publico para imagens de produtos (Valhalla)
-- Reusa o mesmo bucket 'product-images' do projeto original
-- Se ja existir, pular este passo

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Policy: qualquer um pode ver (bucket publico)
create policy "product_images_public_read"
on storage.objects for select
using (bucket_id = 'product-images');

-- Policy: upload
create policy "product_images_upload"
on storage.objects for insert
with check (bucket_id = 'product-images');

-- Policy: delete
create policy "product_images_delete"
on storage.objects for delete
using (bucket_id = 'product-images');
