import React from "react";
import { ShieldAlert, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext.jsx";

export default function AccessMessage({ type = "login" }) {
  const { status } = useAuth();
  const iconMap = {
    login: <LogIn className="w-10 h-10 text-orange-500" />,
    forbidden: <ShieldAlert className="w-10 h-10 text-red-500" />,
  };
  const title = type === "forbidden" ? "Недостаточно прав" : "Требуется авторизация";
  const description =
    type === "forbidden"
      ? "Эта секция доступна только пользователям с расширенными правами."
      : "Войдите через Google или подтвердите email после регистрации, чтобы использовать этот раздел платформы.";

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 bg-white/80 rounded-3xl shadow-inner">
      {iconMap[type]}
      <h2 className="mt-4 text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600 max-w-md">{description}</p>
      {status === "guest" && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => window.dispatchEvent(new CustomEvent("open-auth", { detail: "login" }))}>
            <Lock className="w-4 h-4 mr-2" />
            Войти
          </Button>
        </div>
      )}
    </div>
  );
}
