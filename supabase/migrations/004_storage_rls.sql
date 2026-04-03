-- ============================================================
-- INFUSION.IA — MIGRATION 004: STORAGE E POLÍTICAS EXTRAS
-- ============================================================

-- ── STORAGE BUCKETS ───────────────────────────────────────
-- Execute no Supabase Dashboard > Storage, ou via API:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('business-materials', 'business-materials', false, 20971520,
   ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/plain']),
  ('generated-images', 'generated-images', true, 10485760,
   ARRAY['image/png','image/jpeg','image/webp']),
  ('generated-logos', 'generated-logos', true, 10485760,
   ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('avatars', 'avatars', true, 2097152,
   ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── RLS STORAGE: business-materials ──────────────────────
CREATE POLICY "materials_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'business-materials' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "materials_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'business-materials' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "materials_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'business-materials' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── RLS STORAGE: generated-images (público para leitura) ──
CREATE POLICY "gen_images_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'generated-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "gen_images_select_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'generated-images');

CREATE POLICY "gen_images_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'generated-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── RLS STORAGE: generated-logos ─────────────────────────
CREATE POLICY "gen_logos_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'generated-logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "gen_logos_select_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'generated-logos');

CREATE POLICY "gen_logos_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'generated-logos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── RLS STORAGE: avatars ──────────────────────────────────
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_select_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── ADMIN: service_role tem acesso total ──────────────────
-- (Supabase service_role bypassa RLS por padrão)

-- ── ÍNDICES ADICIONAIS ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_materials_user ON public.business_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_credit_history_reason ON public.credit_history(reason);
