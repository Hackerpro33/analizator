import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import AccessMessage from "@/components/auth/AccessMessage.jsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { listUsers, updateUser } from "@/api/admin";
import { useAuth } from "@/contexts/AuthContext.jsx";
import {
  ACCESS_ITEMS,
  SYSTEM_ROLES,
  appendAuditLog,
  canRoleAccess,
  clearUserRoleOverride,
  getAuditLog,
  getRoleDefinitions,
  getRoleLabel,
  resolveUserRole,
  saveRoleDefinitions,
  setUserRoleOverride,
  slugifyRoleKey,
} from "@/utils/adminAccess";
import {
  Activity,
  KeyRound,
  Plus,
  ScrollText,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";

function syncUsersWithResolvedRoles(items) {
  return (items || []).map((item) => ({
    ...item,
    role: resolveUserRole(item),
  }));
}

export default function Admin() {
  const { user, canAccess } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [roleDefinitions, setRoleDefinitions] = useState(() => getRoleDefinitions());
  const [selectedRoleKey, setSelectedRoleKey] = useState("admin");
  const [auditEntries, setAuditEntries] = useState(() => getAuditLog());
  const [newRoleForm, setNewRoleForm] = useState({
    label: "",
    description: "",
  });

  const canView = Boolean(user) && canAccess("Admin");

  const roleMap = useMemo(() => new Map(roleDefinitions.map((role) => [role.key, role])), [roleDefinitions]);
  const selectedRole = roleMap.get(selectedRoleKey) || roleDefinitions[0] || null;

  const refreshLocalState = useCallback(() => {
    setRoleDefinitions(getRoleDefinitions());
    setAuditEntries(getAuditLog());
  }, []);

  const recordAudit = useCallback(
    (payload) => {
      const entry = appendAuditLog({
        actor_name: user?.full_name || user?.email || "Система",
        actor_email: user?.email || null,
        ...payload,
      });
      setAuditEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    },
    [user]
  );

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await listUsers();
      setUsers(syncUsersWithResolvedRoles(payload.items || []));
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

  useEffect(() => {
    window.addEventListener("admin-access-updated", refreshLocalState);
    return () => window.removeEventListener("admin-access-updated", refreshLocalState);
  }, [refreshLocalState]);

  useEffect(() => {
    if (!selectedRole || !roleMap.has(selectedRoleKey)) {
      setSelectedRoleKey(roleDefinitions[0]?.key || "admin");
    }
  }, [roleDefinitions, roleMap, selectedRole, selectedRoleKey]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (item) =>
        item.email?.toLowerCase().includes(query) ||
        (item.full_name || "").toLowerCase().includes(query) ||
        getRoleLabel(item.role).toLowerCase().includes(query)
    );
  }, [search, users]);

  const filteredAuditEntries = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return auditEntries;
    return auditEntries.filter((item) =>
      [item.actor_name, item.actor_email, item.target_name, item.target_email, item.description, item.action]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [auditEntries, auditSearch]);

  const totals = useMemo(() => {
    const admins = users.filter((item) => item.role === "admin").length;
    const active = users.filter((item) => item.is_active).length;
    const customRoles = roleDefinitions.filter((item) => !item.system).length;
    return { admins, active, customRoles };
  }, [roleDefinitions, users]);

  const handleUserRoleChange = async (targetUser, nextRole) => {
    const previousRole = targetUser.role;
    const description = `Роль пользователя ${targetUser.email} изменена на «${getRoleLabel(nextRole)}».`;

    if (!SYSTEM_ROLES.includes(nextRole)) {
      setUserRoleOverride(targetUser.id, nextRole);
      setUsers((prev) => prev.map((item) => (item.id === targetUser.id ? { ...item, role: nextRole } : item)));
      recordAudit({
        action: "user_role_override",
        target_name: targetUser.full_name || targetUser.email,
        target_email: targetUser.email,
        description,
        meta: { previous_role: previousRole, next_role: nextRole, mode: "local" },
      });
      toast({ title: "Кастомная роль назначена", description: "Изменение сохранено локально в интерфейсе администрирования." });
      return;
    }

    try {
      const response = await updateUser(targetUser.id, { role: nextRole });
      clearUserRoleOverride(targetUser.id);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUser.id
            ? {
                ...response.user,
                role: resolveUserRole(response.user),
              }
            : item
        )
      );
      recordAudit({
        action: "user_role_updated",
        target_name: targetUser.full_name || targetUser.email,
        target_email: targetUser.email,
        description,
        meta: { previous_role: previousRole, next_role: nextRole },
      });
      toast({ title: "Профиль обновлен" });
    } catch (error) {
      toast({ title: "Не удалось обновить роль", description: error?.message, variant: "destructive" });
    }
  };

  const handleUserStatusToggle = async (targetUser) => {
    try {
      const response = await updateUser(targetUser.id, { is_active: !targetUser.is_active });
      setUsers((prev) =>
        prev.map((item) =>
          item.id === targetUser.id
            ? {
                ...response.user,
                role: resolveUserRole(response.user),
              }
            : item
        )
      );
      recordAudit({
        action: targetUser.is_active ? "user_blocked" : "user_activated",
        target_name: targetUser.full_name || targetUser.email,
        target_email: targetUser.email,
        description: targetUser.is_active
          ? `Пользователь ${targetUser.email} был заблокирован.`
          : `Пользователь ${targetUser.email} был активирован.`,
      });
      toast({ title: "Статус пользователя обновлен" });
    } catch (error) {
      toast({ title: "Не удалось обновить статус", description: error?.message, variant: "destructive" });
    }
  };

  const handleCreateRole = () => {
    const label = newRoleForm.label.trim();
    const description = newRoleForm.description.trim();
    const key = slugifyRoleKey(label);

    if (!label || !key) {
      toast({ title: "Укажите название роли", variant: "destructive" });
      return;
    }
    if (roleMap.has(key)) {
      toast({ title: "Роль уже существует", description: "Измените название новой роли.", variant: "destructive" });
      return;
    }

    const nextRole = {
      key,
      label,
      description: description || "Кастомная роль с настраиваемыми разрешениями по вкладкам.",
      system: false,
      access: [],
    };
    const nextDefinitions = [...roleDefinitions, nextRole];
    setRoleDefinitions(saveRoleDefinitions(nextDefinitions));
    setSelectedRoleKey(key);
    setNewRoleForm({ label: "", description: "" });
    recordAudit({
      action: "role_created",
      target_name: label,
      description: `Создана новая роль «${label}».`,
      meta: { role_key: key },
    });
    toast({ title: "Роль создана" });
  };

  const handleDeleteRole = (role) => {
    if (!role || role.system) {
      return;
    }

    const nextDefinitions = roleDefinitions.filter((item) => item.key !== role.key);
    setRoleDefinitions(saveRoleDefinitions(nextDefinitions));
    setSelectedRoleKey("admin");
    setUsers((prev) =>
      prev.map((item) => {
        if (item.role !== role.key) return item;
        setUserRoleOverride(item.id, "user");
        return { ...item, role: "user" };
      })
    );
    recordAudit({
      action: "role_deleted",
      target_name: role.label,
      description: `Роль «${role.label}» удалена.`,
      meta: { role_key: role.key },
    });
    toast({ title: "Роль удалена" });
  };

  const handleToggleRoleAccess = (role, accessKey, checked) => {
    if (!role) return;
    const nextDefinitions = roleDefinitions.map((item) => {
      if (item.key !== role.key) return item;
      const access = checked
        ? Array.from(new Set([...(item.access || []), accessKey]))
        : (item.access || []).filter((entry) => entry !== accessKey);
      return { ...item, access };
    });

    setRoleDefinitions(saveRoleDefinitions(nextDefinitions));
    recordAudit({
      action: "role_access_updated",
      target_name: role.label,
      description: `${checked ? "Открыт" : "Закрыт"} доступ роли «${role.label}» к вкладке «${ACCESS_ITEMS.find((item) => item.key === accessKey)?.label || accessKey}».`,
      meta: { role_key: role.key, access_key: accessKey, enabled: checked },
    });
  };

  if (!canView) {
    return (
      <PageContainer className="space-y-6">
        <AccessMessage type={user ? "forbidden" : "login"} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold heading-text text-slate-900">Администрирование, роли и аудит</h1>
        <p className="max-w-3xl text-slate-600">
          Новая подкладка объединяет управление пользователями, настройку доступа вкладок по ролям, создание и
          удаление ролей, а также журнал действий с фиксацией операций администраторов.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-slate-700 to-slate-900">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{totals.admins}</p>
            <p className="text-sm text-slate-500">Администраторов</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600">
              <Users className="h-6 w-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{users.length}</p>
            <p className="text-sm text-slate-500">Пользователей в системе</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-600">
              <UserCheck className="h-6 w-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{totals.active}</p>
            <p className="text-sm text-slate-500">Активных аккаунтов</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <p className="text-3xl font-bold">{totals.customRoles}</p>
            <p className="text-sm text-slate-500">Кастомных ролей</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-slate-100 p-2 md:grid-cols-3">
          <TabsTrigger value="users" className="rounded-xl py-2">Пользователи</TabsTrigger>
          <TabsTrigger value="roles" className="rounded-xl py-2">Доступы и роли</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-xl py-2">Журнал действий</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-0">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Пользователи и назначения</CardTitle>
                <CardDescription>Назначайте системные или кастомные роли и управляйте активностью учетных записей.</CardDescription>
              </div>
              <Input
                placeholder="Поиск по email, имени или роли"
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
                    <div key={item.id} className="flex flex-col gap-4 rounded-2xl border p-4 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{item.full_name || "Не указано"}</p>
                        <p className="truncate text-sm text-slate-500">{item.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{roleMap.get(item.role)?.label || item.role}</Badge>
                          {!item.is_active && <Badge variant="destructive">Заблокирован</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <Select
                          value={item.role}
                          onValueChange={(value) => handleUserRoleChange(item, value)}
                          disabled={item.email === user.email}
                        >
                          <SelectTrigger className="w-full md:w-56">
                            <SelectValue placeholder="Роль" />
                          </SelectTrigger>
                          <SelectContent>
                            {roleDefinitions.map((role) => (
                              <SelectItem key={role.key} value={role.key}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant={item.is_active ? "outline" : "default"}
                          onClick={() => handleUserStatusToggle(item)}
                          disabled={item.email === user.email}
                        >
                          {item.is_active ? "Заблокировать" : "Активировать"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filteredUsers.length === 0 && <p className="py-6 text-center text-slate-500">Нет пользователей по заданным критериям.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-0">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Создание роли</CardTitle>
                <CardDescription>Новая роль сразу появится в списке и станет доступна для назначения пользователям.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role_label">Название роли</Label>
                  <Input
                    id="role_label"
                    placeholder="Например, Аналитик"
                    value={newRoleForm.label}
                    onChange={(event) => setNewRoleForm((prev) => ({ ...prev, label: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role_description">Описание</Label>
                  <Textarea
                    id="role_description"
                    placeholder="Кратко опишите назначение роли"
                    value={newRoleForm.description}
                    onChange={(event) => setNewRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                    rows={4}
                  />
                </div>
                <Button className="w-full" onClick={handleCreateRole}>
                  <Plus className="mr-2 h-4 w-4" />
                  Создать роль
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Настройка доступа вкладок</CardTitle>
                <CardDescription>Выберите роль и включите только те разделы, которые должны быть видны в боковом меню и доступны по маршруту.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {roleDefinitions.map((role) => {
                      const assignedUsers = users.filter((item) => item.role === role.key).length;
                      const isSelected = selectedRoleKey === role.key;
                      return (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => setSelectedRoleKey(role.key)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">{role.label}</p>
                                {role.system && <Badge variant="secondary">Системная</Badge>}
                              </div>
                              <p className={`mt-1 text-sm ${isSelected ? "text-slate-200" : "text-slate-500"}`}>
                                {role.description || "Без описания"}
                              </p>
                            </div>
                            {!role.system && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={isSelected ? "text-white hover:bg-white/10" : "text-slate-500"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteRole(role);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className={`mt-3 flex items-center gap-4 text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                            <span>{role.access.length} вкладок</span>
                            <span>{assignedUsers} пользователей</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border bg-slate-50 p-4">
                    {selectedRole ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-semibold text-slate-900">{selectedRole.label}</h3>
                            <p className="text-sm text-slate-500">{selectedRole.description}</p>
                          </div>
                          <Badge variant="outline">{selectedRole.access.length} разрешений</Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {ACCESS_ITEMS.filter((item) => !item.public).map((item) => {
                            const isChecked = canRoleAccess(selectedRole.key, item.key);
                            return (
                              <label key={item.key} className="flex items-start gap-3 rounded-xl border bg-white p-3">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => handleToggleRoleAccess(selectedRole, item.key, Boolean(checked))}
                                  disabled={selectedRole.system && selectedRole.key === "admin" && item.key === "Admin"}
                                />
                                <div>
                                  <p className="font-medium text-slate-900">{item.label}</p>
                                  <p className="text-xs text-slate-500">Видимость вкладки и доступ к странице для роли `{selectedRole.key}`.</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500">Выберите роль для настройки доступа.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Журналирование действий пользователей</CardTitle>
                <CardDescription>Журнал фиксирует операции из панели администрирования с указанием исполнителя, цели и времени.</CardDescription>
              </div>
              <Input
                placeholder="Поиск по действию, пользователю или описанию"
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                className="max-w-sm"
              />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Когда</TableHead>
                    <TableHead>Исполнитель</TableHead>
                    <TableHead>Объект</TableHead>
                    <TableHead>Действие</TableHead>
                    <TableHead>Описание</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAuditEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">
                        {new Date(entry.created_at).toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{entry.actor_name || "Система"}</div>
                        {entry.actor_email && <div className="text-xs text-slate-500">{entry.actor_email}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{entry.target_name || "Системная настройка"}</div>
                        {entry.target_email && <div className="text-xs text-slate-500">{entry.target_email}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.action || "event"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{entry.description || "Без описания"}</TableCell>
                    </TableRow>
                  ))}
                  {filteredAuditEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                        Журнал пока пуст. Записи появятся после изменений ролей, доступов и статусов пользователей.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-5">
            <Activity className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm font-medium text-slate-900">Доступы применяются сразу</p>
              <p className="text-xs text-slate-500">Навигация и guard страниц пересчитываются после изменения роли.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-5">
            <ScrollText className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm font-medium text-slate-900">Аудит сохраняется локально</p>
              <p className="text-xs text-slate-500">Журнал хранится в браузере до подключения серверной истории.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-5">
            <KeyRound className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-sm font-medium text-slate-900">Кастомные роли уже доступны</p>
              <p className="text-xs text-slate-500">Их можно назначать пользователям даже до расширения backend-модели.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
