import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { buildGoogleLoginUrl, probeGoogleLogin, resendVerificationEmail } from "@/api/auth";
import { useAuth } from "@/contexts/AuthContext.jsx";
import { openExternalUrl } from "@/lib/externalNavigation";
import { clearRememberedAccount, loadRememberedAccount, saveRememberedAccount } from "@/lib/rememberedAccount";
import { getRoleLabel } from "@/utils/adminAccess";
import { AlertCircle, LogOut, MailCheck, Shield, UserPlus } from "lucide-react";

function CredentialsForm({
  mode,
  onSubmit,
  footer = null,
  errorContent = null,
  suppressErrorToast = false,
  initialValues = null,
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    invite_code: "",
    rememberAccount: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!initialValues) return;
    setForm((prev) => ({
      ...prev,
      ...initialValues,
    }));
  }, [initialValues]);

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
      {!isRegister && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember_account"
            checked={form.rememberAccount}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, rememberAccount: Boolean(checked) }))}
          />
          <Label htmlFor="remember_account" className="text-sm font-normal">
            Запомнить учетную запись
          </Label>
        </div>
      )}
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

  const copyGoogleLink = async () => {
    try {
      await navigator.clipboard.writeText(buildGoogleLoginUrl());
      toast({
        title: "Ссылка скопирована",
        description: "Откройте её во внешнем браузере, если встроенный WebView блокирует Google-вход.",
      });
    } catch (_error) {
      toast({
        title: "Не удалось скопировать ссылку",
        description: "Скопируйте URL вручную из адресной строки или откройте страницу во внешнем браузере.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={async () => {
          try {
            await probeGoogleLogin();
            const url = buildGoogleLoginUrl();
            const navigation = openExternalUrl(url);
            if (navigation.method !== "window.open" && navigation.method !== "anchor") {
              toast({
                title: "Открываем Google-вход",
                description: "Если вход снова откроется во встроенном WebView, скопируйте ссылку ниже и откройте её во внешнем браузере.",
              });
            }
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
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <p>Во встроенном WebView Google может отклонить вход. Открывайте авторизацию во внешнем браузере.</p>
        <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={copyGoogleLink}>
          Скопировать ссылку
        </Button>
      </div>
    </div>
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
  const [rememberedAccount, setRememberedAccount] = useState(() => loadRememberedAccount());

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
          {getRoleLabel(user.role)}
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
                  const authenticatedUser = await login({ email: values.email, password: values.password });
                  if (authenticatedUser?.role === "admin") {
                    clearRememberedAccount();
                    setRememberedAccount(null);
                  } else if (values.rememberAccount) {
                    const nextRememberedAccount = { email: values.email.trim() };
                    saveRememberedAccount(nextRememberedAccount.email);
                    setRememberedAccount(nextRememberedAccount);
                  } else {
                    clearRememberedAccount();
                    setRememberedAccount(null);
                  }
                  setLoginFeedback(null);
                  setOpen(null);
                  toast({ title: "Добро пожаловать" });
                } catch (error) {
                  setLoginFeedback(buildLoginFeedback(error, values.email));
                }
              }}
              initialValues={{
                email: rememberedAccount?.email || "",
                rememberAccount: Boolean(rememberedAccount?.email),
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
