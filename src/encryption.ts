import { decodeBase64, encodeBase64 } from "@std/encoding";

async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive AES key using PBKDF2
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypts a string, returning the base64-encoded version of the encrypted data */
async function encrypt(encryptionSecret: string, string: string) {
  // Generate random salt for key derivation
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive key from password
  const key = await deriveKey(encryptionSecret, salt);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const data = new TextEncoder().encode(string);
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // Combine salt + IV + encrypted data
  const combined = new Uint8Array(
    salt.length + iv.length + encryptedData.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

  return encodeBase64(combined);
}

async function decrypt(encryptionSecret: string, base64: string) {
  // Decode the combined data
  const combined = decodeBase64(base64);

  // Extract salt (first 16 bytes), IV (next 12 bytes), and encrypted data (rest)
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encryptedData = combined.slice(28);

  // Derive the same key using the stored salt
  const key = await deriveKey(encryptionSecret, salt);

  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );

  return new TextDecoder().decode(decryptedData);
}

export const Encryption = { encrypt, decrypt };
