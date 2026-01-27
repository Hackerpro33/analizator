import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  User as UserIcon,
  UserPlus,
  Settings,
  Shield,
  Mail,
  Calendar,
  Search,
  MoreHorizontal,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { fetchUsersOverview } from "@/api/users";
import { updateUser } from "@/api/admin";
import { updateProfile } from "@/api/auth";
import { useAuth } from "@/contexts/AuthContext.jsx";

const ROLE_LABELS = {
  admin: "Администратор",
  security: "Безопасность",
  user: "Пользователь",
};

export default function UserManagement() {
  const { user: sessionUser, refresh } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({ total: 0, active: 0, admins: 0 });
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inlineUpdatingId, setInlineUpdatingId] = useState(null);

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: "", password: "", confirmPassword: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userForm, setUserForm] = useState({ id: null, full_name: "", role: "user", is_active: true });
  const [userSaving, setUserSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchUsersOverview();
      setUsers(payload.items || []);
      setStats(payload.stats || {});
      setCanManage(Boolean(payload.can_manage));
      setCurrentUser(payload.current_user || sessionUser || null);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      setError(err?.message || "Не удалось загрузить пользователей");
    } finally {
      setIsLoading(false);
    }
  }, [sessionUser]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return users.filter(
      (user) =>
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
    );
  }, [users, searchTerm]);

  const getRoleBadge = (role) => {
    const label = ROLE_LABELS[role] || ROLE_LABELS.user;
    const color = role === "admin" ? "bg-red-100 text-red-700" : role === "security" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
    return <Badge className={color}>{label}</Badge>;
  };

  const getRoleIcon = (role) => {
    if (role === "admin" || role === "security") {
      return <Shield className="w-4 h-4 text-red-600" />;
    }
    return <UserIcon className="w-4 h-4 text-blue-600" />;
  };

  const handleAdminUpdate = async (userId, payload, successMessage) => {
    setInlineUpdatingId(userId);
    try {
      await updateUser(userId, payload);
      toast({ title: successMessage || "Пользователь обновлён" });
      await loadOverview();
    } catch (err) {
      toast({
        title: "Не удалось обновить пользователя",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setInlineUpdatingId(null);
    }
  };

  const handleStatusToggle = (user) => {
    const nextStatus = !user.is_active;
    handleAdminUpdate(user.id, { is_active: nextStatus }, nextStatus ? "Пользователь активирован" : "Пользователь деактивирован");
  };

  const handleRoleChange = (user, role) => {
    if (role === user.role) {
      return;
    }
    handleAdminUpdate(user.id, { role }, `Роль изменена на «${ROLE_LABELS[role]}»`);
  };

  const openUserDialog = (user) => {
    setUserForm({
      id: user.id,
      full_name: user.full_name || "",
      role: user.role || "user",
      is_active: user.is_active !== false,
    });
    setUserDialogOpen(true);
  };

  const handleUserDialogSubmit = async (event) => {
    event.preventDefault();
    if (!userForm.id) {
      return;
    }
    setUserSaving(true);
    try {
      await updateUser(userForm.id, {
        full_name: userForm.full_name,
        role: userForm.role,
        is_active: userForm.is_active,
      });
      toast({ title: "Профиль пользователя обновлён" });
      setUserDialogOpen(false);
      await loadOverview();
    } catch (err) {
      toast({
        title: "Не удалось сохранить изменения",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setUserSaving(false);
    }
  };

  const openProfileDialog = () => {
    setProfileForm({
      full_name: currentUser?.full_name || "",
      password: "",
      confirmPassword: "",
    });
    setProfileError(null);
    setProfileDialogOpen(true);
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      setProfileError("Пароли не совпадают");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const payload = { full_name: profileForm.full_name };
      if (profileForm.password) {
        payload.password = profileForm.password;
      }
      await updateProfile(payload);
      toast({ title: "Профиль обновлён" });
      setProfileDialogOpen(false);
      await refresh();
      await loadOverview();
    } catch (err) {
      setProfileError(err?.message || "Не удалось обновить профиль");
    } finally {
      setProfileSaving(false);
    }
  };

  const totalUsers = stats.total ?? users.length;
  const totalActive = stats.active ?? users.filter((u) => u.is_active).length;
  const totalAdmins = stats.admins ?? users.filter((u) => u.role === "admin").length;

  return (
    <div className="space-y-6">
      {currentUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-blue-500" />
              Информация о текущем пользователе
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg">{currentUser.full_name}</div>
                <div className="text-slate-600 flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {currentUser.email}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {getRoleIcon(currentUser.role)}
                  {getRoleBadge(currentUser.role)}
                </div>
              </div>
              <Button variant="outline" className="gap-2" onClick={openProfileDialog}>
                <Settings className="w-4 h-4" />
                Редактировать профиль
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalUsers}</div>
            <div className="text-sm text-slate-600">Всего пользователей</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalActive}</div>
            <div className="text-sm text-slate-600">Активных пользователей</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalAdmins}</div>
            <div className="text-sm text-slate-600">Администраторов</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-emerald-500" />
              Управление пользователями
            </CardTitle>
            {canManage ? (
              <Button className="gap-2">
                <UserPlus className="w-4 h-4" />
                Пригласить пользователя
              </Button>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-500 border-dashed">
                Только просмотр. Управление во вкладке «Администрирование»
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 text-sm text-red-600">{error}</div>
          )}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Поиск пользователей..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                disabled={isLoading}
              />
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-10 text-slate-500 text-sm">
              Загрузка данных пользователей…
            </div>
          )}

          {!isLoading && filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <UserIcon className="w-16 h-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Пользователи не найдены
              </h3>
              <p className="text-slate-500">Попробуйте изменить параметры поиска</p>
            </div>
          )}

          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-slate-400 to-slate-600 rounded-full flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {user.full_name || "Без имени"}
                      {getRoleIcon(user.role)}
                    </div>
                    <div className="text-sm text-slate-600 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {user.email}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" />
                      Последний вход:{" "}
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString("ru-RU")
                        : "нет данных"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getRoleBadge(user.role)}
                  {user.is_active ? (
                    <Badge className="bg-green-100 text-green-700">Активен</Badge>
                  ) : (
                    <Badge variant="outline">Неактивен</Badge>
                  )}

                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={inlineUpdatingId === user.id}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openUserDialog(user)}>
                          <Settings className="w-4 h-4 mr-2" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleStatusToggle(user)}>
                          <Shield className="w-4 h-4 mr-2" />
                          {user.is_active ? "Деактивировать" : "Активировать"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1 text-xs text-slate-500">Назначить роль</div>
                        {["admin", "security", "user"].map((role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() => handleRoleChange(user, role)}
                            disabled={role === user.role}
                          >
                            {role === user.role && <Check className="w-4 h-4 mr-2" />}
                            {role !== user.role && <span className="w-4 h-4 mr-2" />}
                            {ROLE_LABELS[role]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование профиля</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleProfileSubmit}>
            <div className="space-y-2">
              <Label htmlFor="profile_full_name">Имя и фамилия</Label>
              <Input
                id="profile_full_name"
                value={profileForm.full_name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_password">Новый пароль</Label>
              <Input
                id="profile_password"
                type="password"
                value={profileForm.password}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, password: event.target.value }))}
                minLength={8}
                placeholder="Оставьте пустым, чтобы не менять"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile_password_confirm">Подтвердите пароль</Label>
              <Input
                id="profile_password_confirm"
                type="password"
                value={profileForm.confirmPassword}
                onChange={(event) =>
                  setProfileForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                }
                minLength={profileForm.password ? 8 : undefined}
                disabled={!profileForm.password}
              />
            </div>
            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setProfileDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Сохранение..." : "Сохранить изменения"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактирование пользователя</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUserDialogSubmit}>
            <div className="space-y-2">
              <Label htmlFor="user_full_name">Имя</Label>
              <Input
                id="user_full_name"
                value={userForm.full_name}
                onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user_role">Роль</Label>
              <Select
                value={userForm.role}
                onValueChange={(value) => setUserForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger id="user_role">
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="security">Безопасность</SelectItem>
                  <SelectItem value="user">Пользователь</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Активность</p>
                <p className="text-xs text-slate-500">
                  Заблокированные пользователи не смогут войти в систему
                </p>
              </div>
              <Switch
                checked={userForm.is_active}
                onCheckedChange={(checked) => setUserForm((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setUserDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={userSaving}>
                {userSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
