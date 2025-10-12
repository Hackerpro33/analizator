import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Bot, User, RotateCcw, Wand2 } from "lucide-react";

import {
  fetchAssistantState,
  resetAssistantConversation,
  sendChatMessage,
  updateAssistantInstructions,
} from "@/api/chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import PageContainer from "@/components/layout/PageContainer";

const STORAGE_KEY = "insight-assistant-user-id";

function generateLocalId() {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `user-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Assistant() {
  const [userId, setUserId] = useState("");
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const endRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const id = saved || generateLocalId();
    if (!saved) {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    setUserId(id);
  }, []);

  const loadState = useCallback(async (id) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const nextState = await fetchAssistantState(id);
      setState(nextState);
      setInstructionsDraft(nextState.instructions || "");
    } catch (error) {
      console.error("Не удалось загрузить состояние ассистента", error);
      toast({
        title: "Ошибка", 
        description: "Не удалось загрузить состояние ассистента", 
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!userId) return;
    loadState(userId);
  }, [userId, loadState]);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [state?.messages?.length]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!message.trim() || !userId) {
      return;
    }
    setIsSending(true);
    try {
      const nextState = await sendChatMessage(userId, message.trim());
      setState(nextState);
      setMessage("");
    } catch (error) {
      console.error("Не удалось отправить сообщение", error);
      toast({
        title: "Ошибка", 
        description: "Не удалось отправить сообщение", 
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateInstructions = async () => {
    if (!instructionsDraft.trim()) {
      toast({
        title: "Инструкции пустые",
        description: "Добавьте описание желаемого поведения ассистента",
      });
      return;
    }
    setIsSavingInstructions(true);
    try {
      const nextState = await updateAssistantInstructions(userId, instructionsDraft.trim());
      setState(nextState);
      toast({
        title: "Инструкции обновлены",
        description: "Ассистент будет использовать новые указания",
      });
    } catch (error) {
      console.error("Не удалось обновить инструкции", error);
      toast({
        title: "Ошибка", 
        description: "Не удалось сохранить инструкции", 
        variant: "destructive",
      });
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      const nextState = await resetAssistantConversation(userId);
      setState(nextState);
      setInstructionsDraft(nextState.instructions || "");
      toast({
        title: "Диалог очищен",
        description: "История и контекст ассистента сброшены",
      });
    } catch (error) {
      console.error("Не удалось сбросить диалог", error);
      toast({
        title: "Ошибка", 
        description: "Не удалось сбросить диалог", 
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const conversation = useMemo(() => state?.messages || [], [state]);

  return (
    <PageContainer className="space-y-6" maxWidth="max-w-6xl">
      <Card className="border-none shadow-xl bg-white/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold">Аналитический ассистент</CardTitle>
              <CardDescription>
                Каждый пользователь получает собственного ИИ, настройки которого можно менять прямо в процессе диалога.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleReset} disabled={isLoading}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Сбросить диалог
            </Button>
            <Button variant="secondary" onClick={handleUpdateInstructions} disabled={isSavingInstructions || isLoading}>
              <Wand2 className="w-4 h-4 mr-2" />
              Обновить инструкции
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-slate-600">Идентификатор пользователя</label>
            <Input value={userId} readOnly className="mt-1 bg-slate-100" />
              <p className="text-xs text-slate-500 mt-2">
                Сохранён в браузере, чтобы ваш ассистент запоминал историю общения только для вас.
              </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Инструкции для ассистента</label>
            <Textarea
              value={instructionsDraft}
              onChange={(event) => setInstructionsDraft(event.target.value)}
              placeholder="Опишите стиль общения, уровень детализации или цели анализа"
              className="min-h-[120px]"
            />
            <p className="text-xs text-slate-500">
              Измените указания, чтобы скорректировать подход ИИ. Например: "Фокус на анализе аномалий в показателях безопасности районов".
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-xl bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-500" />
            Диалог
          </CardTitle>
          <CardDescription>Обсуждайте шаги анализа, задавайте уточняющие вопросы и сразу же корректируйте указания.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] border rounded-xl bg-white shadow-inner">
            <ScrollArea className="h-full p-4">
              <div className="space-y-4 pr-4">
                {conversation.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-2",
                      item.role === "assistant" ? "items-start" : "items-end"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        item.role === "assistant" ? "text-violet-600" : "text-slate-600"
                      )}
                    >
                      {item.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      {item.role === "assistant" ? "Ассистент" : "Вы"}
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm max-w-2xl", 
                        item.role === "assistant"
                          ? "bg-gradient-to-br from-violet-100 to-indigo-100 text-slate-800"
                          : "bg-slate-900 text-white"
                      )}
                    >
                      {item.content.split("\n").map((line, index) => (
                        <p key={`${item.id}-${index}`} className="whitespace-pre-wrap">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </ScrollArea>
          </div>

          <form onSubmit={handleSend} className="mt-4 space-y-3">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Опишите задачу, гипотезу или данные для анализа"
              className="min-h-[120px]"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isSending || !message.trim()}>
                <Sparkles className="w-4 h-4 mr-2" />
                Отправить запрос
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
