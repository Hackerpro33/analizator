function getCrypto() {
  if (typeof globalThis === "undefined" || !globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API недоступен в текущем окружении.");
  }
  return globalThis.crypto;
}

function textEncoder() {
  return new TextEncoder();
}

function textDecoder() {
  return new TextDecoder();
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(value) {
  const cryptoApi = getCrypto();
  const payload = typeof value === "string" ? textEncoder().encode(value) : value;
  const digest = await cryptoApi.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function createKeyPairBundle() {
  const cryptoApi = getCrypto();
  const keyPair = await cryptoApi.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const [publicJwk, privateJwk] = await Promise.all([
    cryptoApi.subtle.exportKey("jwk", keyPair.publicKey),
    cryptoApi.subtle.exportKey("jwk", keyPair.privateKey),
  ]);

  const fingerprint = (await sha256Hex(JSON.stringify(publicJwk))).slice(0, 16).toUpperCase();

  return {
    publicJwk,
    privateJwk,
    fingerprint,
    algorithm: "RSA-OAEP-2048 / AES-GCM-256",
    createdAt: new Date().toISOString(),
  };
}

export async function importPublicKey(publicJwk) {
  return getCrypto().subtle.importKey(
    "jwk",
    publicJwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKey(privateJwk) {
  return getCrypto().subtle.importKey(
    "jwk",
    privateJwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

export async function encryptPayload(payload, publicJwk) {
  const cryptoApi = getCrypto();
  const aesKey = await cryptoApi.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const rawAesKey = await cryptoApi.subtle.exportKey("raw", aesKey);
  const publicKey = await importPublicKey(publicJwk);

  const [ciphertext, wrappedKey] = await Promise.all([
    cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      textEncoder().encode(JSON.stringify(payload))
    ),
    cryptoApi.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey),
  ]);

  return {
    version: 1,
    algorithm: "AES-GCM-256+RSA-OAEP-2048",
    iv: toBase64(iv),
    key: toBase64(new Uint8Array(wrappedKey)),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function encryptPayloadForRecipients(payload, recipients) {
  const cryptoApi = getCrypto();
  const aesKey = await cryptoApi.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const rawAesKey = await cryptoApi.subtle.exportKey("raw", aesKey);
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    textEncoder().encode(JSON.stringify(payload))
  );

  const envelopes = await Promise.all(
    recipients.map(async (recipient) => {
      const publicKey = await importPublicKey(recipient.publicJwk);
      const wrappedKey = await cryptoApi.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);
      return {
        deviceId: recipient.deviceId,
        key: toBase64(new Uint8Array(wrappedKey)),
      };
    })
  );

  return {
    encryptedPayload: {
      version: 1,
      algorithm: "AES-GCM-256+RSA-OAEP-2048",
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    },
    envelopes,
  };
}

export async function decryptPayload(encryptedPayload, privateJwk, wrappedKeyOverride = null) {
  if (!encryptedPayload) {
    return null;
  }
  const cryptoApi = getCrypto();
  const privateKey = await importPrivateKey(privateJwk);
  const rawAesKey = await cryptoApi.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    fromBase64(wrappedKeyOverride || encryptedPayload.key)
  );
  const aesKey = await cryptoApi.subtle.importKey("raw", rawAesKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encryptedPayload.iv) },
    aesKey,
    fromBase64(encryptedPayload.ciphertext)
  );
  return JSON.parse(textDecoder().decode(plaintext));
}
