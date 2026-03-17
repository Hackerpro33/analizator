const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_NOTE_SECONDS = 15;

const IMAGE_TYPES = ["image/"];
const AUDIO_TYPES = ["audio/"];
const VIDEO_TYPES = ["video/"];
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];

function matchesAnyType(fileType, acceptedTypes) {
  return acceptedTypes.some((type) => (type.endsWith("/") ? fileType.startsWith(type) : fileType === type));
}

export function resolveAttachmentKind(file) {
  const fileType = file?.type || "";
  if (matchesAnyType(fileType, IMAGE_TYPES)) return "image";
  if (matchesAnyType(fileType, AUDIO_TYPES)) return "voice";
  if (matchesAnyType(fileType, VIDEO_TYPES)) return "video_note";
  if (matchesAnyType(fileType, DOCUMENT_TYPES)) return "document";
  return "file";
}

export function validateAttachmentFile(file, options = {}) {
  if (!file) {
    return { ok: false, error: "Файл не выбран." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: "Размер файла превышает лимит 100 МБ.",
    };
  }

  const kind = options.kind || resolveAttachmentKind(file);

  if (kind === "video_note" && typeof options.durationSeconds === "number" && options.durationSeconds > MAX_VIDEO_NOTE_SECONDS) {
    return {
      ok: false,
      error: "Видео-кружок должен быть короче 15 секунд.",
    };
  }

  return { ok: true, kind };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function getMessengerConstraints() {
  return {
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    maxVideoNoteSeconds: MAX_VIDEO_NOTE_SECONDS,
  };
}
