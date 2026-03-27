import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { storageService } from '../../services/storageService.js';
import crypto from 'node:crypto';

// Magic bytes for allowed image types
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from('RIFF'), Buffer.from('WEBP')],
};

function validateMagicBytes(buffer: Buffer): string | null {
  // JPEG
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // WebP
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post('/api/upload/product-image', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado' });
    }

    const buffer = await file.toBuffer();

    // Validate file size (10MB max)
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Arquivo muito grande (máximo 10MB)' });
    }

    // Validate magic bytes (server-side, not just MIME)
    const detectedType = validateMagicBytes(buffer);
    if (!detectedType) {
      return reply.status(400).send({ error: 'Tipo de arquivo inválido. Aceitos: JPEG, PNG, WebP' });
    }

    const ext = EXTENSIONS[detectedType];
    const filename = `products/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const url = await storageService.upload(filename, buffer, detectedType);

    return reply.send({ url, filename });
  });

  app.delete('/api/upload/product-image', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { filename } = request.body as { filename: string };
    if (!filename) return reply.status(400).send({ error: 'Filename obrigatório' });

    await storageService.remove(filename);
    return reply.send({ success: true });
  });
}
