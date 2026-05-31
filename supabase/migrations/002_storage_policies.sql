-- ═══════════════════════════════════════════════════════════════
-- ClasesDe10 — Storage Policies
-- Ejecutar tras crear el bucket 'documentos' en el Dashboard
-- ═══════════════════════════════════════════════════════════════

-- Los objetos del bucket 'documentos' son accesibles públicamente (lectura)
CREATE POLICY "storage_public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'documentos');

-- Un usuario autenticado puede subir archivos a su propia carpeta
-- La estructura es: documentos/{user_id}/{filename}
CREATE POLICY "storage_user_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    -- La primera carpeta debe ser su propio user_id de la tabla usuarios
    SELECT id::text FROM public.usuarios WHERE auth_id = auth.uid()
  )
);

-- Un usuario puede eliminar sus propios archivos
CREATE POLICY "storage_user_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.usuarios WHERE auth_id = auth.uid()
  )
);

-- El admin puede gestionar todo el storage
CREATE POLICY "storage_admin_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'documentos'
  AND EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_id = auth.uid() AND rol = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'documentos'
  AND EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_id = auth.uid() AND rol = 'admin'
  )
);
