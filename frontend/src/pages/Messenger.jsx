import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext.jsx";
import { updateProfile } from "@/api/auth";
import {
  createMessengerSpace,
  deleteMessengerMessage,
  getAttachmentObjectUrl,
  getMessengerBootstrap,
  getMessengerSpaceMessages,
  sendMessengerMessage,
  subscribeMessengerEvents,
  updateMessengerMessage,
  updateMessengerProfile,
} from "@/api/messenger";
import { formatBytes, getMessengerConstraints, validateAttachmentFile } from "@/lib/messengerUtils";
import {
  BadgeCheck,
  Download,
  FileUp,
  Hash,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Mic,
  Plus,
  Radio,
  Send,
  Shield,
  Users,
  Video,
} from "lucide-react";

const ATTACHMENT_ACCEPT =
  "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx";
const IMAGE_ACCEPT = "image/*";
const AUDIO_RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const VIDEO_RECORDING_MIME_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

function formatMessageTime(value) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name) {
  return String(name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось определить длительность видео."));
    };
    video.src = url;
  });
}

function formatRecordingDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pickSupportedMimeType(candidates) {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

export default function Messenger() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const liveVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordingModeRef = useRef(null);

  const [bootstrap, setBootstrap] = useState(null);
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [assetUrls, setAssetUrls] = useState({});
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [messagesBySpace, setMessagesBySpace] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [recordingState, setRecordingState] = useState({
    mode: null,
    active: false,
    stream: null,
  });
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [createForm, setCreateForm] = useState({
    type: "group",
    title: "",
    description: "",
    memberIds: [],
  });
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    status: "",
    phone: "",
    telegram: "",
    department: "",
    avatarFile: null,
  });

  const constraints = getMessengerConstraints();

  const loadMessenger = useCallback(
    async (preferredSpaceId) => {
      if (!user) return;
      setLoading(true);
      try {
        const next = await getMessengerBootstrap(user);
        setBootstrap(next);
        setActiveSpaceId((current) => preferredSpaceId || current || next.spaces[0]?.id || "");
        setProfileForm({
          full_name: next.profile.full_name || "",
          status: next.profile.status || "",
          phone: next.profile.phone || "",
          telegram: next.profile.telegram || "",
          department: next.profile.department || "",
          avatarFile: null,
        });
      } catch (error) {
        toast({
          title: "Не удалось загрузить мессенджер",
          description: error?.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast, user]
  );

  useEffect(() => {
    loadMessenger();
  }, [loadMessenger]);

  useEffect(() => {
    if (!profileForm.avatarFile) {
      setAvatarPreviewUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(profileForm.avatarFile);
    setAvatarPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [profileForm.avatarFile]);

  useEffect(() => {
    if (!bootstrap) return;
    const ids = new Set();
    Object.values(messagesBySpace).forEach((messages) => {
      messages.forEach((message) => {
        (message.payload?.attachments || []).forEach((attachment) => ids.add(attachment.id));
      });
    });
    if (bootstrap.profile.avatar_attachment_id) {
      ids.add(bootstrap.profile.avatar_attachment_id);
    }
    const nextUrls = {};
    ids.forEach((id) => {
      nextUrls[id] = getAttachmentObjectUrl(id);
    });
    setAssetUrls(nextUrls);
  }, [bootstrap, messagesBySpace]);

  const loadSpaceMessages = useCallback(
    async (spaceId) => {
      if (!bootstrap?.keyBundle || !bootstrap?.deviceId || !spaceId) return;
      setMessagesLoading(true);
      try {
        const messages = await getMessengerSpaceMessages(spaceId, bootstrap.keyBundle, bootstrap.deviceId);
        setMessagesBySpace((prev) => ({ ...prev, [spaceId]: messages }));
      } catch (error) {
        toast({
          title: "Не удалось загрузить сообщения",
          description: error?.message,
          variant: "destructive",
        });
      } finally {
        setMessagesLoading(false);
      }
    },
    [bootstrap, toast]
  );

  useEffect(() => {
    if (!activeSpaceId) return;
    loadSpaceMessages(activeSpaceId);
  }, [activeSpaceId, loadSpaceMessages]);

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribe = subscribeMessengerEvents(
      async (event) => {
        if (event.type === "space.created") {
          await loadMessenger(activeSpaceId);
          return;
        }
        if (event.type === "message.created" || event.type === "message.updated" || event.type === "message.deleted") {
          await loadMessenger(activeSpaceId || event.space_id);
          await loadSpaceMessages(event.space_id);
        }
      },
      () => {}
    );
    return unsubscribe;
  }, [activeSpaceId, loadMessenger, loadSpaceMessages, user]);

  const activeSpace = useMemo(
    () => bootstrap?.spaces.find((space) => space.id === activeSpaceId) || bootstrap?.spaces[0] || null,
    [bootstrap, activeSpaceId]
  );

  const activeMessages = messagesBySpace[activeSpace?.id] || [];

  const selectableMembers = useMemo(() => {
    if (!bootstrap) return [];
    return (bootstrap.directory || []).filter((entry) => entry.id !== bootstrap.currentUserId);
  }, [bootstrap]);

  const profileAvatarUrl = bootstrap?.profile?.avatar_attachment_id
    ? assetUrls[bootstrap.profile.avatar_attachment_id]
    : null;

  const collectValidAttachments = useCallback(
    async (files) => {
      const nextAttachments = [];

      for (const file of files) {
        let durationSeconds = null;
        const inferredKind = file.type.startsWith("audio/")
          ? "voice"
          : file.type.startsWith("video/")
            ? "video_note"
            : undefined;

        if (inferredKind === "video_note") {
          try {
            durationSeconds = await readVideoDuration(file);
          } catch (error) {
            toast({
              title: "Видео не добавлено",
              description: error.message,
              variant: "destructive",
            });
            continue;
          }
        }

        const validation = validateAttachmentFile(file, {
          kind: inferredKind,
          durationSeconds,
        });

        if (!validation.ok) {
          toast({
            title: "Вложение отклонено",
            description: validation.error,
            variant: "destructive",
          });
          continue;
        }

        nextAttachments.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          kind: validation.kind,
          durationSeconds,
        });
      }

      return nextAttachments;
    },
    [toast]
  );

  const queueAttachments = useCallback(
    async (files) => {
      const nextAttachments = await collectValidAttachments(files);
      if (nextAttachments.length > 0) {
        setPendingAttachments((prev) => [...prev, ...nextAttachments]);
      }
      return nextAttachments;
    },
    [collectValidAttachments]
  );

  const handleAttachmentSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    await queueAttachments(files);
  };

  const sendPayload = useCallback(
    async ({ text, attachments, resetDraft = false, resetPendingAttachments = false }) => {
      if (!activeSpace || sending) return false;
      const trimmedText = String(text || "").trim();
      if (!trimmedText && (!attachments || attachments.length === 0)) return false;

      setSending(true);
      try {
        await sendMessengerMessage(user, {
          spaceId: activeSpace.id,
          text: trimmedText,
          attachments,
          memberIds: activeSpace.member_ids || [],
        });
        if (resetDraft) {
          setDraft("");
        }
        if (resetPendingAttachments) {
          setPendingAttachments([]);
        }
        await loadSpaceMessages(activeSpace.id);
        await loadMessenger(activeSpace.id);
        return true;
      } catch (error) {
        toast({
          title: "Сообщение не отправлено",
          description: error?.message,
          variant: "destructive",
        });
        return false;
      } finally {
        setSending(false);
      }
    },
    [activeSpace, loadMessenger, loadSpaceMessages, sending, toast, user]
  );

  const handleSend = useCallback(async () => {
    await sendPayload({
      text: draft,
      attachments: pendingAttachments,
      resetDraft: true,
      resetPendingAttachments: true,
    });
  }, [draft, pendingAttachments, sendPayload]);

  const stopRecordingStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    mediaStreamRef.current = null;
  }, []);

  const finalizeRecording = useCallback(
    async (blob, mode, elapsedMs) => {
      if (!blob || blob.size === 0) {
        toast({
          title: "Запись не сохранена",
          description: "Не удалось получить данные с микрофона или камеры.",
          variant: "destructive",
        });
        return;
      }

      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File(
        [blob],
        mode === "voice" ? `voice-${Date.now()}.${extension}` : `video-note-${Date.now()}.${extension}`,
        { type: blob.type || (mode === "voice" ? "audio/webm" : "video/webm") }
      );
      const durationSeconds =
        mode === "video_note"
          ? elapsedMs > 0
            ? elapsedMs / 1000
            : await readVideoDuration(file)
          : elapsedMs > 0
            ? elapsedMs / 1000
            : null;
      const validation = validateAttachmentFile(file, { kind: mode, durationSeconds });
      if (!validation.ok) {
        toast({
          title: "Вложение отклонено",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }
      const attachments = [
        {
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          kind: validation.kind,
          durationSeconds,
        },
      ];

      await sendPayload({
        text: draft,
        attachments,
        resetDraft: true,
      });
    },
    [draft, sendPayload, toast]
  );

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(
    async (mode) => {
      if (sending || !activeSpace) return;
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        toast({
          title: "Запись недоступна",
          description: "Браузер не поддерживает доступ к микрофону или камере.",
          variant: "destructive",
        });
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        toast({
          title: "Запись недоступна",
          description: "MediaRecorder не поддерживается в этом браузере.",
          variant: "destructive",
        });
        return;
      }
      if (recordingState.active) return;

      try {
        const wantsVideo = mode === "video_note";
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: wantsVideo
            ? {
                facingMode: "user",
                width: { ideal: 360 },
                height: { ideal: 360 },
              }
            : false,
        });

        const mimeType = pickSupportedMimeType(wantsVideo ? VIDEO_RECORDING_MIME_TYPES : AUDIO_RECORDING_MIME_TYPES);
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const startedAt = Date.now();

        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        recordingChunksRef.current = [];
        recordingStartedAtRef.current = startedAt;
        recordingModeRef.current = mode;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordingChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          stopRecordingStream();
          setRecordingState({ mode: null, active: false, stream: null });
          toast({
            title: "Ошибка записи",
            description: "Не удалось записать медиа. Проверьте доступ к устройству и попробуйте снова.",
            variant: "destructive",
          });
        };

        recorder.onstop = async () => {
          const currentMode = recordingModeRef.current;
          const elapsedMs = Math.max(0, Date.now() - recordingStartedAtRef.current);
          const blob = new Blob(recordingChunksRef.current, {
            type: recorder.mimeType || (currentMode === "voice" ? "audio/webm" : "video/webm"),
          });

          mediaRecorderRef.current = null;
          recordingChunksRef.current = [];
          recordingModeRef.current = null;
          recordingStartedAtRef.current = 0;
          stopRecordingStream();
          setRecordingElapsedMs(0);
          setRecordingState({ mode: null, active: false, stream: null });

          await finalizeRecording(blob, currentMode, elapsedMs);
        };

        const videoTrack = wantsVideo ? stream.getVideoTracks()[0] : null;
        if (videoTrack) {
          videoTrack.enabled = true;
        }

        recorder.start(250);
        setRecordingElapsedMs(0);
        setRecordingState({ mode, active: true, stream });
      } catch (error) {
        const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
        const missingDevice = error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError";
        toast({
          title: denied ? "Нужен доступ к устройству" : "Запись не запущена",
          description: denied
            ? `Разрешите доступ к ${mode === "video_note" ? "камере и микрофону" : "микрофону"} в окне браузера или в настройках сайта.`
            : missingDevice
              ? `На устройстве не найден ${mode === "video_note" ? "камера или микрофон" : "микрофон"}.`
              : error?.message || "Не удалось начать запись.",
          variant: "destructive",
        });
      }
    },
    [activeSpace, finalizeRecording, recordingState.active, sending, stopRecordingStream, toast]
  );

  const handleDeleteMessage = useCallback(
    async (message) => {
      if (!activeSpace || sending) return;
      try {
        await deleteMessengerMessage(activeSpace.id, message.id);
        if (editingMessageId === message.id) {
          setEditingMessageId("");
          setEditingText("");
        }
        await loadSpaceMessages(activeSpace.id);
        await loadMessenger(activeSpace.id);
      } catch (error) {
        toast({
          title: "Сообщение не удалено",
          description: error?.message,
          variant: "destructive",
        });
      }
    },
    [activeSpace, editingMessageId, loadMessenger, loadSpaceMessages, sending, toast]
  );

  const handleEditMessage = useCallback(
    async (message) => {
      if (!activeSpace || sending) return;
      const nextText = editingText.trim();
      if (!nextText) {
        toast({
          title: "Пустой текст",
          description: "Введите текст, который нужно сохранить.",
          variant: "destructive",
        });
        return;
      }
      try {
        await updateMessengerMessage(user, {
          spaceId: activeSpace.id,
          messageId: message.id,
          text: nextText,
          memberIds: activeSpace.member_ids || [],
        });
        setEditingMessageId("");
        setEditingText("");
        await loadSpaceMessages(activeSpace.id);
        await loadMessenger(activeSpace.id);
      } catch (error) {
        toast({
          title: "Сообщение не обновлено",
          description: error?.message,
          variant: "destructive",
        });
      }
    },
    [activeSpace, editingText, loadMessenger, loadSpaceMessages, sending, toast, user]
  );

  useEffect(() => {
    if (!recordingState.active) {
      setRecordingElapsedMs(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRecordingElapsedMs(Math.max(0, Date.now() - recordingStartedAtRef.current));
    }, 200);
    return () => window.clearInterval(timer);
  }, [recordingState.active]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video || !recordingState.stream) return undefined;
    video.srcObject = recordingState.stream;
    video.play().catch(() => {});
    return () => {
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
  }, [recordingState.stream]);

  useEffect(() => {
    if (!recordingState.active) return undefined;
    const handlePointerRelease = () => {
      void stopRecording();
    };
    window.addEventListener("pointerup", handlePointerRelease);
    window.addEventListener("pointercancel", handlePointerRelease);
    return () => {
      window.removeEventListener("pointerup", handlePointerRelease);
      window.removeEventListener("pointercancel", handlePointerRelease);
    };
  }, [recordingState.active, stopRecording]);

  useEffect(
    () => () => {
      stopRecordingStream();
    },
    [stopRecordingStream]
  );

  const handleCreateSpace = async (event) => {
    event.preventDefault();
    try {
      const created = await createMessengerSpace(user, {
        ...createForm,
        memberIds: createForm.memberIds,
      });
      setCreateDialogOpen(false);
      setCreateForm({ type: "group", title: "", description: "", memberIds: [] });
      await loadMessenger(created.id);
      toast({ title: `${created.type === "channel" ? "Канал" : "Группа"} создан(а)` });
    } catch (error) {
      toast({
        title: "Не удалось создать пространство",
        description: error?.message,
        variant: "destructive",
      });
    }
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    try {
      await updateProfile({ full_name: profileForm.full_name });
      await updateMessengerProfile(user, profileForm);
      await refresh();
      await loadMessenger(activeSpace?.id);
      setProfileDialogOpen(false);
      toast({ title: "Профиль обновлен" });
    } catch (error) {
      toast({
        title: "Не удалось обновить профиль",
        description: error?.message,
        variant: "destructive",
      });
    }
  };

  if (loading && !bootstrap) {
    return (
      <PageContainer className="space-y-6">
        <div className="py-24 text-center text-slate-500">Подготовка защищенного мессенджера…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="max-w-[1600px]" className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_32%),linear-gradient(135deg,_#fff_0%,_#f8fafc_48%,_#eef2ff_100%)] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">E2EE Web Crypto</Badge>
              <h1 className="text-3xl font-bold text-slate-900">Мессенджер</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Локальный защищенный контур для текстов, голоса, изображений, документов, файлов до {formatBytes(constraints.maxFileSizeBytes)} и
                видео-кружков до {constraints.maxVideoNoteSeconds} секунд.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setProfileDialogOpen(true)}>
                <BadgeCheck className="h-4 w-4" />
                Профиль
              </Button>
              <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Канал или группа
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-slate-200/80 bg-white/80">
              <CardContent className="flex items-start gap-3 p-4">
                <Lock className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Сообщения шифруются на клиенте</p>
                  <p className="text-xs text-slate-600">AES-GCM для контента, RSA-OAEP для упаковки ключа.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-white/80">
              <CardContent className="flex items-start gap-3 p-4">
                <KeyRound className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Локальный отпечаток ключа</p>
                  <p className="text-xs text-slate-600">{bootstrap?.keyBundle?.fingerprint || "Недоступно"}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-white/80">
              <CardContent className="flex items-start gap-3 p-4">
                <Shield className="mt-0.5 h-5 w-5 text-violet-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Приватные ключи остаются в браузере</p>
                  <p className="text-xs text-slate-600">Ключевой материал не покидает устройство, сообщения и вложения отправляются в серверный контур.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-slate-200/80 bg-slate-950 text-slate-50">
          <CardHeader>
            <CardTitle className="text-base">Текущий профиль доступа</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border border-white/15">
                <AvatarImage src={profileAvatarUrl || undefined} alt={bootstrap?.profile?.full_name} />
                <AvatarFallback className="bg-white/10 text-white">
                  {getInitials(bootstrap?.profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{bootstrap?.profile?.full_name}</div>
                <div className="text-sm text-slate-300">{bootstrap?.profile?.status}</div>
              </div>
            </div>
            <div className="grid gap-2 text-sm text-slate-300">
              <div>Роль: <span className="font-medium text-white">{bootstrap?.profile?.role}</span></div>
              <div>Email: <span className="font-medium text-white">{bootstrap?.profile?.email || "не указан"}</span></div>
              <div>Телефон: <span className="font-medium text-white">{bootstrap?.profile?.phone || "не указан"}</span></div>
              <div>Контакт: <span className="font-medium text-white">{bootstrap?.profile?.telegram || "не указан"}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <Card className="border-slate-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Пространства
              <Badge variant="outline">{bootstrap?.spaces.length || 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bootstrap?.spaces.map((space) => {
              const isActive = space.id === activeSpace?.id;
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => setActiveSpaceId(space.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    isActive ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{space.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Badge variant="outline" className="rounded-full px-2 py-0">
                          {space.label}
                        </Badge>
                        <span>{space.members.length} участника</span>
                      </div>
                    </div>
                    {space.type === "channel" ? <Hash className="h-4 w-4 text-slate-400" /> : <Users className="h-4 w-4 text-slate-400" />}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">{space.preview}</p>
                  <div className="mt-2 text-xs text-slate-400">{formatMessageTime(space.last_message_at)}</div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{activeSpace?.title || "Диалог не выбран"}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{activeSpace?.description || "Выберите группу, канал или прямой диалог."}</p>
              </div>
              {activeSpace && <Badge variant="secondary">{activeSpace.label}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="max-h-[620px] space-y-4 overflow-y-auto px-6 py-6">
              {messagesLoading && activeMessages.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">Загрузка сообщений…</div>
              ) : null}
              {activeMessages.map((message) => {
                const isOwn = message.sender_id === bootstrap?.currentUserId;
                const payload = message.payload || {};
                const isEditing = editingMessageId === message.id;
                const canEdit = isOwn && !message.is_deleted && (payload.attachments || []).length === 0;
                const canDelete = isOwn && !message.is_deleted;
                return (
                  <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[82%] rounded-3xl px-4 py-3 shadow-sm ${
                        isOwn ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-900"
                      }`}
                    >
                      <div className={`mb-2 flex items-center gap-2 text-xs ${isOwn ? "text-slate-300" : "text-slate-500"}`}>
                        <span className="font-medium">{message.sender?.full_name || "Система"}</span>
                        <span>{formatMessageTime(message.created_at)}</span>
                        {message.is_edited && !message.is_deleted ? <span>изменено</span> : null}
                        {message.encrypted && <Lock className="h-3.5 w-3.5" />}
                      </div>
                      {message.is_deleted ? (
                        <p className="text-sm italic opacity-80">Сообщение удалено</p>
                      ) : payload.decryption_error ? (
                        <p className="text-sm">Не удалось расшифровать сообщение.</p>
                      ) : (
                        <>
                          {isEditing ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                                className="min-h-[96px] resize-none rounded-2xl border-slate-300 bg-white text-slate-900"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingMessageId("");
                                    setEditingText("");
                                  }}
                                >
                                  Отмена
                                </Button>
                                <Button type="button" size="sm" onClick={() => void handleEditMessage(message)}>
                                  Сохранить
                                </Button>
                              </div>
                            </div>
                          ) : payload.text ? (
                            <p className="whitespace-pre-wrap text-sm leading-6">{payload.text}</p>
                          ) : null}
                          {(payload.attachments || []).length > 0 && (
                            <div className="mt-3 space-y-3">
                              {payload.attachments.map((attachment) => {
                                const attachmentUrl = assetUrls[attachment.id];
                                const isImage = attachment.kind === "image";
                                const isAudio = attachment.kind === "voice";
                                const isVideo = attachment.kind === "video_note";
                                return (
                                  <div
                                    key={attachment.id}
                                    className={`rounded-2xl border p-3 ${
                                      isOwn ? "border-white/15 bg-white/10" : "border-slate-200 bg-white"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-medium">{attachment.name}</div>
                                        <div className={`text-xs ${isOwn ? "text-slate-300" : "text-slate-500"}`}>
                                          {formatBytes(attachment.size)}
                                          {attachment.duration_seconds ? ` • ${Math.round(attachment.duration_seconds)} сек` : ""}
                                        </div>
                                      </div>
                                      {attachmentUrl ? (
                                        <a
                                          href={attachmentUrl}
                                          download={attachment.name}
                                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                                            isOwn ? "text-white" : "text-slate-700"
                                          }`}
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          Скачать
                                        </a>
                                      ) : null}
                                    </div>
                                    {isImage && attachmentUrl ? (
                                      <img src={attachmentUrl} alt={attachment.name} className="mt-3 max-h-64 rounded-2xl object-cover" />
                                    ) : null}
                                    {isAudio && attachmentUrl ? (
                                      <audio src={attachmentUrl} controls className="mt-3 w-full" />
                                    ) : null}
                                    {isVideo && attachmentUrl ? (
                                      <video src={attachmentUrl} controls className="mt-3 max-h-72 w-full rounded-2xl object-cover" />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {(canEdit || canDelete) && !isEditing ? (
                            <div className={`mt-3 flex gap-2 text-xs ${isOwn ? "text-slate-300" : "text-slate-500"}`}>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditingText(payload.text || "");
                                  }}
                                  className="transition hover:opacity-100 opacity-80"
                                >
                                  Редактировать
                                </button>
                              ) : null}
                              {canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteMessage(message)}
                                  className="transition hover:opacity-100 opacity-80"
                                >
                                  Удалить
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 px-6 py-5">
              {pendingAttachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingAttachments.map((attachment) => (
                    <Badge key={attachment.id} variant="secondary" className="gap-2 rounded-full px-3 py-1">
                      <span>{attachment.file.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                        className="text-xs text-slate-500"
                      >
                        удалить
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Текст сообщения, служебная заметка или комментарий к вложению"
                  className="min-h-[104px] resize-none rounded-2xl border-slate-200"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={handleAttachmentSelection}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={handleAttachmentSelection}
                  />
                  <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                    <FileUp className="h-4 w-4" />
                    Файлы
                  </Button>
                  <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => imageInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" />
                    Картинки
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`justify-start gap-2 ${recordingState.active && recordingState.mode === "voice" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : ""}`}
                    disabled={sending || recordingState.active}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void startRecording("voice");
                    }}
                  >
                    <Mic className="h-4 w-4" />
                    {recordingState.active && recordingState.mode === "voice" ? "Запись..." : "Голос"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`justify-start gap-2 ${recordingState.active && recordingState.mode === "video_note" ? "border-violet-500 bg-violet-50 text-violet-700" : ""}`}
                    disabled={sending || recordingState.active}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void startRecording("video_note");
                    }}
                  >
                    <Video className="h-4 w-4" />
                    {recordingState.active && recordingState.mode === "video_note" ? "Идет видео..." : "Видео-кружок"}
                  </Button>
                  <Button type="button" className="justify-start gap-2" disabled={sending} onClick={handleSend}>
                    <Send className="h-4 w-4" />
                    {sending ? "Отправка..." : "Отправить"}
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Для голоса и видео удерживайте кнопку. Браузер сам запросит разрешение на микрофон и камеру, если оно еще не выдано.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-base">Участники</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(activeSpace?.members || []).map((memberId) => {
                const member = memberId;
                if (!member) return null;
                return (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{member.full_name}</div>
                      <div className="truncate text-xs text-slate-500">{member.email}</div>
                    </div>
                    <Badge variant="outline">{member.role}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <CardHeader>
              <CardTitle className="text-base">Ограничения медиа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-emerald-600" />
                Голосовые сообщения как `audio/*`.
              </div>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-sky-600" />
                Изображения и документы до {formatBytes(constraints.maxFileSizeBytes)}.
              </div>
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-violet-600" />
                Видео-кружки не длиннее {constraints.maxVideoNoteSeconds} секунд.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Создать канал или группу</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateSpace}>
            <div className="space-y-2">
              <Label htmlFor="messenger_space_type">Тип</Label>
              <Select value={createForm.type} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, type: value }))}>
                <SelectTrigger id="messenger_space_type">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Группа</SelectItem>
                  <SelectItem value="channel">Канал</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger_space_title">Название</Label>
              <Input
                id="messenger_space_title"
                value={createForm.title}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Например, Оперативный штаб"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger_space_description">Описание</Label>
              <Textarea
                id="messenger_space_description"
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Коротко опишите назначение пространства"
              />
            </div>
            <div className="space-y-2">
              <Label>Участники</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectableMembers.map((member) => {
                  const checked = createForm.memberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() =>
                        setCreateForm((prev) => ({
                          ...prev,
                          memberIds: checked
                            ? prev.memberIds.filter((item) => item !== member.id)
                            : [...prev.memberIds, member.id],
                        }))
                      }
                      className={`rounded-2xl border p-3 text-left transition ${
                        checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-medium text-slate-900">{member.full_name}</div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Создать</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Редактирование профиля</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleProfileSave}>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarPreviewUrl || profileAvatarUrl || undefined} />
                <AvatarFallback>{getInitials(profileForm.full_name)}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Button type="button" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                  Изменить фото
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) =>
                    setProfileForm((prev) => ({ ...prev, avatarFile: event.target.files?.[0] || null }))
                  }
                />
                <p className="text-xs text-slate-500">Фото сохраняется в локальный защищенный профиль браузера.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger_profile_name">Имя</Label>
              <Input
                id="messenger_profile_name"
                value={profileForm.full_name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger_profile_status">Статус</Label>
              <Input
                id="messenger_profile_status"
                value={profileForm.status}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, status: event.target.value }))}
                placeholder="На связи / В командировке / Дежурю"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="messenger_profile_phone">Телефон</Label>
                <Input
                  id="messenger_profile_phone"
                  value={profileForm.phone}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+7 ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="messenger_profile_telegram">Контакт</Label>
                <Input
                  id="messenger_profile_telegram"
                  value={profileForm.telegram}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, telegram: event.target.value }))}
                  placeholder="@handle / матричный ID / внутр. контакт"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger_profile_department">Подразделение</Label>
              <Input
                id="messenger_profile_department"
                value={profileForm.department}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, department: event.target.value }))}
                placeholder="ИБ / Администрирование / Аналитика"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setProfileDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {recordingState.active && (
        <div className="fixed bottom-6 right-6 z-50">
          {recordingState.mode === "voice" ? (
            <div className="flex items-center gap-4 rounded-full border border-emerald-200 bg-white/95 px-5 py-4 shadow-2xl backdrop-blur">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <span className="absolute h-12 w-12 rounded-full bg-emerald-500/20 animate-ping" />
                <Mic className="relative z-10 h-5 w-5 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">Идет запись голоса</div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono text-sm text-slate-700">{formatRecordingDuration(recordingElapsedMs)}</span>
                  <span>Отпустите кнопку, чтобы отправить</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-violet-200 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-violet-400/80 shadow-lg">
                  <span className="absolute inset-0 rounded-full border-4 border-violet-300/70 animate-pulse" />
                  <video ref={liveVideoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Идет запись видео</div>
                  <div className="font-mono text-lg">{formatRecordingDuration(recordingElapsedMs)}</div>
                  <div className="text-xs text-slate-300">Отпустите кнопку, чтобы остановить и отправить кружок</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
