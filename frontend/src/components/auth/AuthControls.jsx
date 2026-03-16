import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { buildGoogleLoginUrl, probeGoogleLogin, resendVerificationEmail } from "@/api/auth";
import { useAuth } from "@/contexts/AuthContext.jsx";
import { AlertCircle, LogOut, MailCheck, Shield, UserPlus } from "lucide-react";

function CredentialsForm({ mode, onSubmit, footer = null, errorContent = null, suppressErrorToast = false }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    invite_code: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(form);
    } catch (error) {
      if (!suppressErrorToast) {
        toast({
          title: "Ошибка",
          description: error?.message || "Не удалось выполнить запрос",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {isRegister && (
        <div className="space-y-2">
          <Label htmlFor="full_name">Имя и фамилия</Label>
          <Input id="full_name" value={form.full_name} onChange={handleChange("full_name")} required />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={form.email} onChange={handleChange("email")} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          type="password"
          value={form.password}
          onChange={handleChange("password")}
          minLength={8}
          required
        />
      </div>
      {isRegister && (
        <div className="space-y-2">
          <Label htmlFor="invite_code">Инвайт-код (для ролей безопасности)</Label>
          <Input id="invite_code" value={form.invite_code} onChange={handleChange("invite_code")} />
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isRegister ? "Зарегистрироваться" : "Войти"}
      </Button>
      {errorContent}
      {footer}
    </form>
  );
}

function GoogleLoginButton() {
  const { toast } = useToast();

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={async () => {
        try {
          await probeGoogleLogin();
          window.location.assign(buildGoogleLoginUrl());
        } catch (error) {
          toast({
            title: "Google-вход недоступен",
            description: error?.message || "Сервер временно недоступен. Попробуйте ещё раз позже.",
            variant: "destructive",
          });
        }
      }}
    >
      Войти через Google
    </Button>
  );
}

function PendingVerification({ verification, onResend }) {
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-slate-800">
      <div className="flex items-center gap-3">
        <MailCheck className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="font-semibold">Проверьте почту</p>
          <p className="text-sm text-slate-600">{verification.masked_email}</p>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Мы отправили ссылку для подтверждения. Локальный вход станет доступен только после активации email.
      </p>
      <Button type="button" variant="outline" className="w-full" onClick={onResend}>
        Отправить письмо ещё раз
      </Button>
    </div>
  );
}

export default function AuthControls() {
  const { user, status, login, register, logout } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [loginFeedback, setLoginFeedback] = useState(null);

  useEffect(() => {
    const handler = (event) => {
      setOpen(event.detail || null);
    };
    window.addEventListener("open-auth", handler);
    return () => window.removeEventListener("open-auth", handler);
  }, []);

  useEffect(() => {
    if (open !== "register") {
      setPendingVerification(null);
    }
  }, [open]);

  useEffect(() => {
    if (open !== "login") {
      setLoginFeedback(null);
    }
  }, [open]);

  const buildLoginFeedback = (error, email) => {
    const details = error?.details && typeof error.details === "object" ? error.details : {};
    const message = details.message || error?.message || "Не удалось выполнить вход.";
    return {
      message,
      suggestion: details.suggestion || null,
      email,
      allowGoogle: Boolean(details.allow_google),
      allowRegistration: Boolean(details.allow_registration),
      allowResendVerification: Boolean(details.allow_resend_verification),
    };
  };

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Shield className="w-4 h-4 animate-spin" />
        Проверка доступа…
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-semibold text-slate-100">{user.full_name || user.email}</p>
          <p className="text-xs text-slate-400 uppercase">Роль: {user.role}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {user.role === "admin" ? "Админ" : user.role === "security" ? "Безопасность" : "Пользователь"}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-200"
          onClick={async () => {
            await logout();
            toast({ title: "Вы вышли из системы" });
          }}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open === "login"} onOpenChange={(value) => setOpen(value ? "login" : null)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Вход
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Вход в систему</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <GoogleLoginButton />
            <div className="text-center text-xs uppercase tracking-[0.2em] text-slate-400">или</div>
            <CredentialsForm
              mode="login"
              errorContent={
                loginFeedback ? (
                  <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{loginFeedback.message}</AlertTitle>
                    <AlertDescription className="space-y-3">
                      {loginFeedback.suggestion ? <p>{loginFeedback.suggestion}</p> : null}
                      {loginFeedback.allowResendVerification ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={async () => {
                            await resendVerificationEmail({ email: loginFeedback.email });
                            toast({ title: "Письмо отправлено повторно" });
                          }}
                        >
                          Отправить письмо повторно
                        </Button>
                      ) : null}
                      {loginFeedback.allowGoogle ? <GoogleLoginButton /> : null}
                      {loginFeedback.allowRegistration ? (
                        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen("register")}>
                          Зарегистрироваться
                        </Button>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null
              }
              suppressErrorToast
              onSubmit={async (values) => {
                try {
                  await login({ email: values.email, password: values.password });
                  setLoginFeedback(null);
                  setOpen(null);
                  toast({ title: "Добро пожаловать" });
                } catch (error) {
                  setLoginFeedback(buildLoginFeedback(error, values.email));
                }
              }}
            />
            <p className="text-sm text-slate-500">Локальный вход доступен только после подтверждения email.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "register"} onOpenChange={(value) => setOpen(value ? "register" : null)}>
        <DialogTrigger asChild>
          <Button size="sm">
            <UserPlus className="w-4 h-4 mr-1" />
            Регистрация
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать аккаунт</DialogTitle>
          </DialogHeader>
          {pendingVerification ? (
            <PendingVerification
              verification={pendingVerification}
              onResend={async () => {
                await resendVerificationEmail({ email: pendingVerification.email });
                toast({ title: "Письмо отправлено повторно" });
              }}
            />
          ) : (
            <CredentialsForm
              mode="register"
              footer={<p className="text-sm text-slate-500">Если аккаунт уже существует, попробуйте войти или используйте Google.</p>}
              onSubmit={async (values) => {
                const result = await register({
                  email: values.email,
                  password: values.password,
                  full_name: values.full_name,
                  invite_code: values.invite_code || undefined,
                });
                setPendingVerification(result);
                toast({ title: "Регистрация создана", description: "Подтвердите email из письма" });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
