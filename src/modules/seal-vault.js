export const SEAL_VAULT_SCHEMA = 'yinji-seal-vault/v1';
const ITERATIONS = 250000;

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase, salt, usages) {
  if (String(passphrase).length < 8) {
    throw new Error('保险库口令至少需要 8 个字符');
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function encryptSealVault(seals, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify({ seals }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    schema: SEAL_VAULT_SCHEMA,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSealVault(envelope, passphrase) {
  if (!envelope || envelope.schema !== SEAL_VAULT_SCHEMA) {
    throw new Error('不是受支持的 Yinji 加密保险库');
  }
  if (String(passphrase).length < 8) {
    throw new Error('保险库口令至少需要 8 个字符');
  }
  try {
    if (
      envelope.kdf?.name !== 'PBKDF2' ||
      envelope.kdf?.hash !== 'SHA-256' ||
      envelope.kdf?.iterations !== ITERATIONS ||
      envelope.cipher?.name !== 'AES-GCM'
    ) {
      throw new Error('unsupported parameters');
    }
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('invalid parameters');
    const key = await deriveKey(passphrase, salt, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (!Array.isArray(parsed.seals)) throw new Error('保险库内容无效');
    return parsed.seals;
  } catch (error) {
    throw new Error('口令错误或保险库已经损坏');
  }
}

export function downloadVaultFile(envelope) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `yinji-seal-vault-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
