import { buildApiUrl, buildWsUrl, jsonRequest } from "@/api/http";
import { createKeyPairBundle, decryptPayload, encryptPayloadForRecipients } from "@/lib/messengerCrypto";

const MESSENGER_KEYRING_KEY = "messenger-keyring-v2";
const MESSENGER_DEVICE_KEY = "messenger-device-map-v2";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getUserKey(user) {
  return String(user?.id || user?.email || "current-user");
}

function getKeyring() {
  return readStorage(MESSENGER_KEYRING_KEY, {});
}

function saveKeyring(keyring) {
  writeStorage(MESSENGER_KEYRING_KEY, keyring);
}

function getStoredDeviceMap() {
  return readStorage(MESSENGER_DEVICE_KEY, {});
}

function saveStoredDeviceMap(value) {
  writeStorage(MESSENGER_DEVICE_KEY, value);
}

function normalizeProfile(profile) {
  return {
    ...profile,
    id: String(profile.id),
  };
}

function normalizeAttachment(attachment) {
  return {
    id: attachment.id,
    kind: attachment.media_kind,
    name: attachment.original_filename,
    type: attachment.content_type,
    size: attachment.size_bytes,
    duration_seconds: attachment.encrypted_metadata?.duration_seconds || null,
    encrypted_metadata: attachment.encrypted_metadata || {},
  };
}

function normalizeMessage(message) {
  return {
    ...message,
    sender_id: message.sender_user_id,
    created_at: message.created_at,
    updated_at: message.updated_at || null,
    edited_at: message.edited_at || null,
    deleted_at: message.deleted_at || null,
    is_edited: Boolean(message.is_edited),
    is_deleted: Boolean(message.is_deleted),
  };
}

function normalizeSpace(space) {
  return {
    id: space.id,
    title: space.title,
    type: space.type,
    label: space.label,
    description: space.description || "",
    members: (space.members || []).map(normalizeProfile),
    member_ids: space.member_ids || [],
    admin_user_ids: space.admin_user_ids || [],
    can_manage_members: Boolean(space.can_manage_members),
    created_by: space.created_by || null,
    updated_at: space.updated_at,
    last_message_at: space.last_message?.created_at || space.updated_at,
    preview: space.last_message ? `Сообщение ${new Date(space.last_message.created_at).toLocaleString("ru-RU")}` : "Сообщений пока нет",
  };
}

function normalizeRecipientDevice(device) {
  return {
    deviceId: device.id,
    publicJwk: device.identity_key,
  };
}

export async function ensureMessengerKeys(userId) {
  const keyring = getKeyring();
  if (keyring[userId]) {
    return keyring[userId];
  }
  const bundle = await createKeyPairBundle();
  keyring[userId] = bundle;
  saveKeyring(keyring);
  return bundle;
}

async function ensureRegisteredDevice(user, existingDevices = []) {
  const userKey = getUserKey(user);
  const keyBundle = await ensureMessengerKeys(userKey);
  const storedMap = getStoredDeviceMap();
  const currentDeviceId = storedMap[userKey];

  if (currentDeviceId && existingDevices.some((device) => device.id === currentDeviceId && device.is_active !== false)) {
    return { keyBundle, deviceId: currentDeviceId };
  }

  const created = await jsonRequest("/api/messenger/devices", {
    method: "POST",
    body: JSON.stringify({
      label: `Web ${navigator.platform || "browser"}`,
      device_kind: "web",
      identity_key: keyBundle.publicJwk,
      prekey_bundle: {
        algorithm: keyBundle.algorithm,
        fingerprint: keyBundle.fingerprint,
        created_at: keyBundle.createdAt,
      },
    }),
  });

  storedMap[userKey] = created.id;
  saveStoredDeviceMap(storedMap);
  return { keyBundle, deviceId: created.id };
}

export function getAttachmentDownloadUrl(attachmentId) {
  return buildApiUrl(`/api/messenger/attachments/${encodeURIComponent(attachmentId)}/download`);
}

export async function getAttachmentObjectUrl(attachmentId) {
  const response = await fetch(getAttachmentDownloadUrl(attachmentId), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    let message = "Не удалось загрузить вложение";
    try {
      message = await response.text();
    } catch (_error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function decryptServerMessage(message, keyBundle, deviceId) {
  if (message.is_deleted) {
    return normalizeMessage({
      ...message,
      payload: {
        text: "",
        attachments: [],
      },
    });
  }
  const envelope = (message.envelopes || []).find(
    (item) => item.device_id === deviceId || item.deviceId === deviceId
  );
  if (!envelope) {
    return normalizeMessage({
      ...message,
      payload: {
        text: "",
        attachments: (message.attachments || []).map(normalizeAttachment),
        decryption_error: true,
      },
    });
  }

  try {
    const payload = await decryptPayload(message.encrypted_payload, keyBundle.privateJwk, envelope.key);
    return normalizeMessage({
      ...message,
      payload: {
        ...payload,
        attachments: (message.attachments || []).map(normalizeAttachment),
      },
    });
  } catch (_error) {
    return normalizeMessage({
      ...message,
      payload: {
        text: "",
        attachments: (message.attachments || []).map(normalizeAttachment),
        decryption_error: true,
      },
    });
  }
}

export async function getMessengerBootstrap(user) {
  const initial = await jsonRequest("/api/messenger/bootstrap", { method: "GET" });
  const { keyBundle, deviceId } = await ensureRegisteredDevice(user, initial.devices || []);
  const bootstrap = initial.devices?.some((item) => item.id === deviceId)
    ? initial
    : await jsonRequest("/api/messenger/bootstrap", { method: "GET" });
  const directory = await jsonRequest("/api/messenger/directory", { method: "GET" });

  return {
    currentUserId: String(bootstrap.profile.id),
    profile: normalizeProfile(bootstrap.profile),
    spaces: (bootstrap.spaces || []).map(normalizeSpace),
    devices: bootstrap.devices || [],
    rtc: {
      iceServers: bootstrap.rtc?.ice_servers || [],
    },
    directory: (directory.items || []).map(normalizeProfile),
    keyBundle,
    deviceId,
  };
}

export async function getMessengerProfile() {
  const profile = await jsonRequest("/api/messenger/profile", { method: "GET" });
  return normalizeProfile(profile);
}

export async function getMessengerSpaceMessages(spaceId, keyBundle, deviceId) {
  const payload = await jsonRequest(`/api/messenger/spaces/${encodeURIComponent(spaceId)}/messages`, {
    method: "GET",
  });
  const messages = await Promise.all(
    (payload.items || []).map((message) => decryptServerMessage(message, keyBundle, deviceId))
  );
  return messages;
}

export async function createMessengerSpace(_user, payload) {
  const response = await jsonRequest("/api/messenger/spaces", {
    method: "POST",
    body: JSON.stringify({
      type: payload.type,
      title: payload.title,
      description: payload.description,
      member_ids: payload.memberIds,
    }),
  });
  return normalizeSpace(response);
}

export async function updateMessengerSpaceMembership(spaceId, payload) {
  const response = await jsonRequest(`/api/messenger/spaces/${encodeURIComponent(spaceId)}/membership`, {
    method: "PATCH",
    body: JSON.stringify({
      add_member_ids: payload.addMemberIds || [],
      remove_member_ids: payload.removeMemberIds || [],
      grant_admin_ids: payload.grantAdminIds || [],
      revoke_admin_ids: payload.revokeAdminIds || [],
    }),
  });
  return normalizeSpace(response);
}

async function fetchUserDevices(userId) {
  const payload = await jsonRequest(`/api/messenger/users/${encodeURIComponent(userId)}/devices`, {
    method: "GET",
  });
  return (payload.items || []).map(normalizeRecipientDevice);
}

async function buildEncryptedMessagePayload(user, memberIds, clearPayload) {
  const bootstrap = await getMessengerBootstrap(user);
  const recipientDevicesById = new Map();

  for (const memberId of memberIds || []) {
    const devices = await fetchUserDevices(memberId);
    devices.forEach((device) => recipientDevicesById.set(device.deviceId, device));
  }

  recipientDevicesById.set(bootstrap.deviceId, {
    deviceId: bootstrap.deviceId,
    publicJwk: bootstrap.keyBundle.publicJwk,
  });

  const encrypted = await encryptPayloadForRecipients(
    clearPayload,
    Array.from(recipientDevicesById.values())
  );

  return {
    bootstrap,
    encrypted,
  };
}

async function uploadMessengerAttachment(file, kind, durationSeconds = null) {
  const form = new FormData();
  form.append("file", file);
  form.append("media_kind", kind);
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    form.append("duration_seconds", String(Math.round(durationSeconds)));
  }
  form.append(
    "encrypted_metadata",
    JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type,
      duration_seconds: durationSeconds,
    })
  );
  const response = await fetch(buildApiUrl("/api/messenger/attachments"), {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) {
    let message = "Не удалось загрузить вложение";
    try {
      const contentType = response.headers?.get?.("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        const detail = payload?.detail ?? payload?.message ?? payload;
        if (typeof detail === "string") {
          message = detail;
        } else if (detail && typeof detail === "object") {
          message = detail.message || JSON.stringify(detail);
        }
      } else {
        const text = await response.text();
        if (text && !/<html[\s>]/i.test(text)) {
          message = text;
        } else if (response.status >= 500) {
          message = "Сервер временно недоступен. Попробуйте еще раз через минуту.";
        }
      }
    } catch (_error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json();
}

export async function sendMessengerMessage(user, payload) {
  const uploadedAttachments = [];
  for (const attachment of payload.attachments || []) {
    const uploaded = await uploadMessengerAttachment(attachment.file, attachment.kind, attachment.durationSeconds);
    uploadedAttachments.push(uploaded);
  }

  const clearPayload = {
    text: String(payload.text || ""),
    attachments: uploadedAttachments.map(normalizeAttachment),
  };

  const { bootstrap, encrypted } = await buildEncryptedMessagePayload(user, payload.memberIds || [], clearPayload);

  return jsonRequest(`/api/messenger/spaces/${encodeURIComponent(payload.spaceId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      sender_device_id: bootstrap.deviceId,
      client_message_id: crypto.randomUUID?.() || `${Date.now()}`,
      message_type: uploadedAttachments.length > 0 && payload.text ? "mixed" : uploadedAttachments[0]?.media_kind || "text",
      encrypted_payload: encrypted.encryptedPayload,
      envelopes: encrypted.envelopes.map((item) => ({
        device_id: item.deviceId,
        key: item.key,
      })),
      attachment_ids: uploadedAttachments.map((item) => item.id),
    }),
  });
}

export async function updateMessengerMessage(user, payload) {
  const clearPayload = {
    text: String(payload.text || ""),
    attachments: [],
  };
  const { encrypted } = await buildEncryptedMessagePayload(user, payload.memberIds || [], clearPayload);

  return jsonRequest(
    `/api/messenger/spaces/${encodeURIComponent(payload.spaceId)}/messages/${encodeURIComponent(payload.messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        message_type: "text",
        encrypted_payload: encrypted.encryptedPayload,
        envelopes: encrypted.envelopes.map((item) => ({
          device_id: item.deviceId,
          key: item.key,
        })),
      }),
    }
  );
}

export async function deleteMessengerMessage(spaceId, messageId) {
  return jsonRequest(
    `/api/messenger/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function updateMessengerProfile(_user, payload) {
  let avatarAttachmentId = null;
  if (payload.avatarFile) {
    const uploaded = await uploadMessengerAttachment(payload.avatarFile, "image");
    avatarAttachmentId = uploaded.id;
  }

  return jsonRequest("/api/messenger/profile", {
    method: "PATCH",
    body: JSON.stringify({
      status: payload.status,
      phone: payload.phone,
      telegram: payload.telegram,
      department: payload.department,
      avatar_attachment_id: avatarAttachmentId || undefined,
    }),
  });
}

export function subscribeMessengerEvents(onEvent, onError) {
  const pendingEvents = [];
  let socket = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let closedByClient = false;

  const clearReconnect = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closedByClient) return;
    clearReconnect();
    const delayMs = Math.min(5000, 500 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = window.setTimeout(() => {
      connect();
    }, delayMs);
  };

  const flushPending = () => {
    while (pendingEvents.length > 0 && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(pendingEvents.shift()));
    }
  };

  const connect = () => {
    try {
      socket = new WebSocket(buildWsUrl("/api/messenger/ws"));
    } catch (error) {
      onError?.(error);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectAttempts = 0;
      flushPending();
    };
    socket.onmessage = (event) => {
      try {
        onEvent?.(JSON.parse(event.data));
      } catch (error) {
        onError?.(error);
      }
    };
    socket.onerror = (event) => onError?.(event);
    socket.onclose = () => {
      scheduleReconnect();
    };
  };

  connect();

  return {
    send(event) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
      } else {
        pendingEvents.push(event);
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          scheduleReconnect();
        }
      }
    },
    close() {
      closedByClient = true;
      clearReconnect();
      socket?.close();
    },
  };
}
