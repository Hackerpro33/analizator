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
  getAttachmentObjectUrl,
  getMessengerBootstrap,
  getMessengerSpaceMessages,
  sendMessengerMessage,
  subscribeMessengerEvents,
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

export default function Messenger() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);

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
        if (event.type === "message.created") {
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

  const handleAttachmentSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

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

    setPendingAttachments((prev) => [...prev, ...nextAttachments]);
  };

  const handleSend = async () => {
    if (!activeSpace || sending) return;
    if (!draft.trim() && pendingAttachments.length === 0) return;

    setSending(true);
    try {
      await sendMessengerMessage(user, {
        spaceId: activeSpace.id,
        text: draft.trim(),
        attachments: pendingAttachments,
        memberIds: activeSpace.member_ids || [],
      });
      setDraft("");
      setPendingAttachments([]);
      await loadSpaceMessages(activeSpace.id);
      await loadMessenger(activeSpace.id);
    } catch (error) {
      toast({
        title: "Сообщение не отправлено",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

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
                  <p className="text-xs text-slate-600">Текущая реализация хранит ключи и медиа локально до серверной интеграции.</p>
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
                        {message.encrypted && <Lock className="h-3.5 w-3.5" />}
                      </div>
                      {payload.decryption_error ? (
                        <p className="text-sm">Не удалось расшифровать сообщение.</p>
                      ) : (
                        <>
                          {payload.text ? <p className="whitespace-pre-wrap text-sm leading-6">{payload.text}</p> : null}
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
                  <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" />
                    Картинки
                  </Button>
                  <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Mic className="h-4 w-4" />
                    Голос
                  </Button>
                  <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Video className="h-4 w-4" />
                    Видео-кружок
                  </Button>
                  <Button type="button" className="justify-start gap-2" disabled={sending} onClick={handleSend}>
                    <Send className="h-4 w-4" />
                    {sending ? "Отправка..." : "Отправить"}
                  </Button>
                </div>
              </div>
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
    </PageContainer>
  );
}
