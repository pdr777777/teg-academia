jest.mock('@supabase/supabase-js');
const { createClient } = require('@supabase/supabase-js');
const supabaseStorageService = require('./supabaseStorageService');

describe('uploadFotoPerfil', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
    createClient.mockReset();
  });

  test('sobe o arquivo e retorna a URL pública', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://exemplo.supabase.co/storage/v1/object/public/fotos-perfil/42-123.jpg' } });
    createClient.mockReturnValue({
      storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    });

    const url = await supabaseStorageService.uploadFotoPerfil(42, Buffer.from('fake'), 'image/jpeg');

    expect(url).toBe('https://exemplo.supabase.co/storage/v1/object/public/fotos-perfil/42-123.jpg');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^42-\d+\.jpeg$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true })
    );
  });

  test('propaga erro quando o Supabase Storage falha', async () => {
    const upload = jest.fn().mockResolvedValue({ error: { message: 'bucket não encontrado' } });
    createClient.mockReturnValue({
      storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl: jest.fn() }) },
    });

    await expect(supabaseStorageService.uploadFotoPerfil(43, Buffer.from('fake'), 'image/jpeg'))
      .rejects.toThrow('bucket não encontrado');
  });
});
