const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'fotos-perfil';

async function uploadFotoPerfil(usuarioId, buffer, mimeType) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ext = mimeType.split('/')[1];
  const caminho = `${usuarioId}-${Date.now()}.${ext}`;

  const { error } = await client.storage.from(BUCKET).upload(caminho, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = client.storage.from(BUCKET).getPublicUrl(caminho);
  return data.publicUrl;
}

module.exports = { uploadFotoPerfil };
