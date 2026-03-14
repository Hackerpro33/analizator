import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { listUsers, updateUser } from "@/api/admin";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext.jsx";
import AccessMessage from "@/components/auth/AccessMessage.jsx";
import { Shield, Users, UserCheck } from "lucide-react";

const ROLE_LABELS = {
  admin: "Администратор",
  security: "Безопасность",
  user: "Пользователь",
};

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const canView = user && user.role === "admin";

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await listUsers();
      setUsers(payload.items || []);
    } catch (error) {
      toast({ title: "Ошибка загрузки пользователей", description: error?.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canView) {
      loadUsers();
    }
  }, [canView, loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter(
      (item) =>
        item.email.toLowerCase().includes(search.toLowerCase()) ||
        (item.full_name || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  const handleUpdate = async (id, payload) => {
    try {
      const response = await updateUser(id, payload);
      toast({ title: "Профиль обновлен" });
      setUsers((prev) => prev.map((item) => (item.id === id ? response.user : item)));
    } catch (error) {
      toast({ title: "Не удалось обновить пользователя", description: error?.message, variant: "destructive" });
    }
  };

  if (!canView) {
    return (
      <PageContainer className="space-y-6">
        <AccessMessage type={user ? "forbidden" : "login"} />
      </PageContainer>
    );
  }

  const totalAdmins = users.filter((item) => item.role === "admin").length;
  const totalSecurity = users.filter((item) => item.role === "security").length;
  const activeUsers = users.filter((item) => item.is_active).length;

  return (
    <PageContainer className="space-y-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold heading-text text-slate-900">Администрирование и роли</h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Управляйте доступом пользователей, назначайте роли безопасности и контролируйте активность аккаунтов.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-slate-700 to-slate-900 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{totalAdmins}</p>
            <p className="text-sm text-slate-500">Администраторов</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{totalSecurity}</p>
            <p className="text-sm text-slate-500">Офицеров безопасности</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{activeUsers}</p>
            <p className="text-sm text-slate-500">Активных аккаунтов</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Пользователи</CardTitle>
          <Input
            placeholder="Поиск по email или имени"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500">Загрузка пользователей…</p>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((item) => (
                <div key={item.id} className="p-4 border rounded-2xl flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{item.full_name || "Не указано"}</p>
                    <p className="text-sm text-slate-500 truncate">{item.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{ROLE_LABELS[item.role] || item.role}</Badge>
                      {!item.is_active && <Badge variant="destructive">Заблокирован</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <Select
                      value={item.role}
                      onValueChange={(value) => handleUpdate(item.id, { role: value })}
                      disabled={item.email === user.email}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Роль" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Администратор</SelectItem>
                        <SelectItem value="security">Безопасность</SelectItem>
                        <SelectItem value="user">Пользователь</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant={item.is_active ? "outline" : "default"}
                      onClick={() => handleUpdate(item.id, { is_active: !item.is_active })}
                      disabled={item.email === user.email}
                    >
                      {item.is_active ? "Заблокировать" : "Активировать"}
                    </Button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-slate-500 py-6">Нет пользователей по заданным критериям.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
