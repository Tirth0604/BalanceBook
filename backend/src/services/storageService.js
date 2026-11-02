'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Pluggable receipt/avatar storage. `local` is the zero-config default (served from
 * /uploads); `cloudinary` talks to the REST API directly so the app needs no extra SDK.
 */

const KINDS = new Set(['receipts', 'avatars', 'group-images', 'settlement-proofs']);

function assertKind(kind) {
  if (!KINDS.has(kind)) throw ApiError.internal(`Unknown storage kind: ${kind}`);
}

async function saveLocal({ buffer, kind, safeName }) {
  const directory = path.join(config.UPLOAD_DIR, kind);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, safeName), buffer);
  const base = String(config.PUBLIC_URL || '').replace(/\/$/, '');
  return {
    driver: 'local',
    url: `${base}/uploads/${kind}/${safeName}`,
    publicId: `${kind}/${safeName}`,
  };
}

async function saveCloudinary({ buffer, kind, mimeType, safeName }) {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = config;
  if (!cloud || !apiKey || !secret) {
    throw ApiError.internal('CLOUDINARY_* configuration is incomplete');
  }
  const folder = `balancebook/${kind}`;
  const timestamp = Math.floor(Date.now() / 1000);
  // Signature covers the exact parameters sent, sorted alphabetically, plus the secret.
  const toSign = `folder=${folder}&public_id=${path.parse(safeName).name}&timestamp=${timestamp}${secret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', path.parse(safeName).name);
  form.append('signature', signature);
  form.append('resource_type', mimeType === 'application/pdf' ? 'raw' : 'image');
  form.append('file', new Blob([buffer], { type: mimeType }), safeName);

  const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw ApiError.internal(`Cloudinary upload failed: ${payload?.error?.message || response.status}`);
  }
  return { driver: 'cloudinary', url: payload.secure_url, publicId: payload.public_id };
}

async function save({ buffer, mimeType, fileName, safeName, kind = 'receipts' }) {
  assertKind(kind);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw ApiError.badRequest('Uploaded file is empty');
  if (buffer.length > config.MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'UPLOAD_INVALID', `File exceeds ${config.MAX_UPLOAD_BYTES} bytes`);
  }
  const stored =
    config.UPLOAD_DRIVER === 'cloudinary'
      ? await saveCloudinary({ buffer, kind, mimeType, safeName })
      : await saveLocal({ buffer, kind, safeName });

  return {
    ...stored,
    mimeType,
    sizeBytes: buffer.length,
    fileName: typeof fileName === 'string' ? fileName.slice(0, 140) : 'receipt',
    uploadedAt: new Date(),
  };
}

async function remove(reference) {
  if (!reference) return;
  if (reference.driver === 'local') {
    const relative = reference.publicId;
    if (!relative || relative.includes('..')) return;
    await fs.rm(path.join(config.UPLOAD_DIR, relative), { force: true });
    return;
  }
  if (reference.driver === 'cloudinary' && config.CLOUDINARY_CLOUD_NAME) {
    // Signed destroy is best-effort: an orphaned asset must never fail the user's request.
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHash('sha1')
        .update(`public_id=${reference.publicId}&timestamp=${timestamp}${config.CLOUDINARY_API_SECRET}`)
        .digest('hex');
      const form = new URLSearchParams({
        api_key: config.CLOUDINARY_API_KEY,
        public_id: reference.publicId,
        signature,
        timestamp: String(timestamp),
      });
      await fetch(`https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/destroy`, {
        method: 'POST',
        body: form,
      });
    } catch {
      /* ignore */
    }
  }
}

module.exports = { save, remove, KINDS };
