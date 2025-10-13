import React, { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, MessageSquarePlus, ShieldCheck, Users } from "lucide-react";

import {
  createComment,
  createWorkspace,
  getAccessPolicies,
  listComments,
  listWorkspaces,
  updateAccessPolicy,
} from "@/api/collaboration";
import { getDatasets } from "@/api/entities";

const emptyCommentForm = {
  author: "",
  datasetId: "",
  widgetId: "",
  row: "",
  column: "",
  text: "",
  mentions: "",
};

const emptyWorkspaceForm = {
  name: "",
  createdBy: "",
  parentId: "",
  inheritPermissions: true,
  description: "",
};

function CommentTargetDetails({ target }) {
  if (!target) {
    return null;
  }

  const chips = [];
  if (target.dataset_id) {
    chips.push({ label: "Датасет", value: target.dataset_id });
  }
  if (target.widget_id) {
    chips.push({ label: "Виджет", value: target.widget_id });
  }
  if (target.row !== undefined && target.row !== null) {
    chips.push({ label: "Строка", value: target.row });
  }
  if (target.column) {
    chips.push({ label: "Столбец", value: target.column });
  }
  if (Array.isArray(target.data_point_path) && target.data_point_path.length > 0) {
    chips.push({ label: "Путь", value: target.data_point_path.join(" → ") });
  }

  if (chips.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">Комментарий к рабочему пространству</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map((chip) => (
        <Badge key={`${chip.label}-${chip.value}`} variant="secondary" className="text-xs">
          <span className="font-medium text-foreground/70 mr-1">{chip.label}:</span>
          {chip.value}
        </Badge>
      ))}
    </div>
  );
}

function AssignmentList({ policy }) {
  if (!policy || !policy.assignments || policy.assignments.length === 0) {
    return <div className="text-sm text-muted-foreground">Назначения не заданы.</div>;
  }

  return (
    <div className="space-y-3">
      {policy.assignments.map((assignment) => (
        <Card key={assignment.id} className="border border-border/60">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{assignment.user_id}</div>
                <div className="text-xs text-muted-foreground">
                  Роль: <span className="font-medium uppercase">{assignment.role}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(assignment.tags || []).map((tag) => (
                  <Badge key={`${assignment.id}-tag-${tag}`} variant="outline" className="text-xs">
                    Тег: {tag}
                  </Badge>
                ))}
                {(assignment.folders || []).map((folder) => (
                  <Badge key={`${assignment.id}-folder-${folder}`} variant="secondary" className="text-xs">
                    Папка: {folder}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Collaboration() {
  const [workspaceData, setWorkspaceData] = useState({ count: 0, items: [] });
  const [policies, setPolicies] = useState([]);
  const [commentFeed, setCommentFeed] = useState({ count: 0, items: [] });
  const [datasets, setDatasets] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [commentForm, setCommentForm] = useState(emptyCommentForm);
  const [workspaceForm, setWorkspaceForm] = useState(emptyWorkspaceForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState("comments");

  const workspaces = workspaceData.items || [];
  const workspaceOptions = workspaces.map((item) => ({
    id: item.workspace.id,
    name: item.workspace.name,
  }));

  const activeWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId) {
      return selectedWorkspaceId;
    }
    return workspaceOptions[0]?.id || null;
  }, [selectedWorkspaceId, workspaceOptions]);

  const activePolicy = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return policies.find((item) => item.workspace_id === activeWorkspaceId) || null;
  }, [activeWorkspaceId, policies]);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      try {
        const [workspaceResponse, policiesResponse, datasetsResponse, commentsResponse] = await Promise.all([
          listWorkspaces(),
          getAccessPolicies(),
          getDatasets(),
          listComments(),
        ]);
        setWorkspaceData(workspaceResponse);
        setPolicies(policiesResponse || []);
        setDatasets(Array.isArray(datasetsResponse) ? datasetsResponse : []);
        setCommentFeed(commentsResponse || { count: 0, items: [] });
        setError(null);
      } catch (err) {
        console.error("Не удалось загрузить данные сотрудничества", err);
        setError("Ошибка загрузки данных. Попробуйте позже.");
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaceOptions.length > 0) {
      setSelectedWorkspaceId(workspaceOptions[0].id);
    }
  }, [selectedWorkspaceId, workspaceOptions]);

  useEffect(() => {
    if (activeWorkspaceId) {
      refreshComments(activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  const handleCommentChange = (field) => (event) => {
    setCommentForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleWorkspaceFormChange = (field) => (event) => {
    const value = field === "inheritPermissions" ? event.target.checked : event.target.value;
    setWorkspaceForm((prev) => ({ ...prev, [field]: value }));
  };

  const refreshComments = async (workspaceId) => {
    const response = await listComments({ workspace_id: workspaceId });
    setCommentFeed(response || { count: 0, items: [] });
  };

  const refreshPolicies = async () => {
    const response = await getAccessPolicies();
    setPolicies(response || []);
  };

  const refreshWorkspaces = async () => {
    const response = await listWorkspaces();
    setWorkspaceData(response);
  };

  const handleSubmitComment = async (event) => {
    event.preventDefault();
    if (!activeWorkspaceId) {
      setError("Создайте рабочее пространство перед добавлением комментария.");
      return;
    }
    if (!commentForm.author || !commentForm.text) {
      setError("Укажите автора и текст комментария.");
      return;
    }

    setSubmitting(true);
    try {
      const mentions = commentForm.mentions
        ? commentForm.mentions.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined;

      const payload = {
        text: commentForm.text,
        created_by: commentForm.author,
        mentions,
        target: {
          workspace_id: activeWorkspaceId,
          dataset_id: commentForm.datasetId || undefined,
          widget_id: commentForm.widgetId || undefined,
          column: commentForm.column || undefined,
          row:
            commentForm.row !== "" && !Number.isNaN(Number.parseInt(commentForm.row, 10))
              ? Number.parseInt(commentForm.row, 10)
              : undefined,
        },
      };

      await createComment(payload);
      await refreshComments(activeWorkspaceId);
      setCommentForm(emptyCommentForm);
      setSuccessMessage("Комментарий сохранён.");
      setError(null);
    } catch (err) {
      console.error("Не удалось добавить комментарий", err);
      setError("Не удалось добавить комментарий.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    if (!workspaceForm.name || !workspaceForm.createdBy) {
      setError("Укажите название и автора пространства.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: workspaceForm.name,
        created_by: workspaceForm.createdBy,
        description: workspaceForm.description || undefined,
        parent_id: workspaceForm.parentId || undefined,
        inherit_permissions: workspaceForm.inheritPermissions,
      };
      const response = await createWorkspace(payload);
      await Promise.all([refreshWorkspaces(), refreshPolicies()]);
      if (response?.workspace?.id) {
        setSelectedWorkspaceId(response.workspace.id);
        setActiveTab("comments");
      }
      setWorkspaceForm(emptyWorkspaceForm);
      setSuccessMessage("Рабочее пространство создано.");
      setError(null);
    } catch (err) {
      console.error("Не удалось создать пространство", err);
      setError("Не удалось создать рабочее пространство.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePolicyToggle = async (assignmentId, role) => {
    if (!activePolicy) {
      return;
    }
    const updatedAssignments = activePolicy.assignments.map((assignment) =>
      assignment.id === assignmentId ? { ...assignment, role } : assignment
    );
    try {
      const normalizedAssignments = updatedAssignments.map((assignment) => ({
        id: assignment.id,
        user_id: assignment.user_id,
        role: assignment.role,
        tags: assignment.tags || [],
        folders: assignment.folders || [],
      }));

      await updateAccessPolicy(activePolicy.workspace_id, {
        assignments: normalizedAssignments,
        actor: "ui-admin",
      });
      await refreshPolicies();
      setSuccessMessage("Права доступа обновлены.");
    } catch (err) {
      console.error("Не удалось обновить политику", err);
      setError("Ошибка обновления прав доступа.");
    }
  };

  const datasetsForSelect = useMemo(() => {
    return (datasets || []).map((dataset) => ({
      id: dataset.id || dataset.dataset_id || dataset.name,
      name: dataset.name || dataset.title || dataset.id,
    }));
  }, [datasets]);

  const renderComments = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка комментариев
        </div>
      );
    }

    if (!commentFeed.items || commentFeed.items.length === 0) {
      return <div className="text-sm text-muted-foreground">Комментариев пока нет.</div>;
    }

    return (
      <div className="space-y-4">
        {commentFeed.items.map((comment) => (
          <Card key={comment.id} className="border border-border/60">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs uppercase tracking-wide">
                      {comment.created_by}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleString()}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground">{comment.text}</p>
                  <CommentTargetDetails target={comment.target} />
                  {comment.mentions && comment.mentions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {comment.mentions.map((mention) => (
                        <Badge key={`${comment.id}-${mention}`} variant="secondary" className="text-xs">
                          @{mention}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {comment.resolved && (
                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-600">
                    Закрыт
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderWorkspaceHierarchy = () => {
    if (workspaces.length === 0) {
      return <div className="text-sm text-muted-foreground">Нет рабочих пространств.</div>;
    }

    return (
      <div className="space-y-3">
        {workspaces.map((item) => (
          <Card
            key={item.workspace.id}
            className={`border ${item.workspace.id === activeWorkspaceId ? "border-primary" : "border-border/60"}`}
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedWorkspaceId(item.workspace.id)}
                    className="text-left"
                  >
                    <div className="font-semibold text-sm">{item.workspace.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.breadcrumbs.map((crumb) => crumb.name).join(" / ")}
                    </div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(item.workspace.tags || []).map((tag) => (
                      <Badge key={`${item.workspace.id}-tag-${tag}`} variant="outline" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Наследование: {item.workspace.inherit_permissions ? "вкл" : "выкл"}
                  <div>Назначено: {item.effective_assignments.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Совместная работа</h1>
          <p className="text-muted-foreground max-w-2xl">
            Управляйте рабочими пространствами, назначайте роли и оставляйте контекстные комментарии прямо на
            виджетах и строках данных.
          </p>
        </div>

        {error && (
          <Card className="border border-destructive/40 bg-destructive/10">
            <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}
        {successMessage && (
          <Card className="border border-emerald-200 bg-emerald-50">
            <CardContent className="py-3 text-sm text-emerald-700">{successMessage}</CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 sm:w-auto sm:grid-cols-3">
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" /> Комментарии
            </TabsTrigger>
            <TabsTrigger value="policies" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Доступ
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Пространства
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comments" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Журнал комментариев</CardTitle>
                  <CardDescription>
                    Контекстные обсуждения с привязкой к конкретным графикам, таблицам и строкам данных.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[420px] pr-4">{renderComments()}</ScrollArea>
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Новый комментарий</CardTitle>
                  <CardDescription>Используйте @упоминания для привлечения коллег к обсуждению.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitComment} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Автор</label>
                      <Input
                        placeholder="Имя сотрудника"
                        value={commentForm.author}
                        onChange={handleCommentChange("author")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Датасет</label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={commentForm.datasetId}
                        onChange={handleCommentChange("datasetId")}
                      >
                        <option value="">Без привязки</option>
                        {datasetsForSelect.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Виджет</label>
                        <Input
                          placeholder="chart-1, table-2..."
                          value={commentForm.widgetId}
                          onChange={handleCommentChange("widgetId")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Столбец</label>
                        <Input
                          placeholder="revenue"
                          value={commentForm.column}
                          onChange={handleCommentChange("column")}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Строка</label>
                        <Input
                          placeholder="0"
                          value={commentForm.row}
                          onChange={handleCommentChange("row")}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">@Упоминания</label>
                        <Input
                          placeholder="ivanov, petrov"
                          value={commentForm.mentions}
                          onChange={handleCommentChange("mentions")}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Комментарий</label>
                      <Textarea
                        placeholder="Опишите наблюдение или вопрос"
                        value={commentForm.text}
                        onChange={handleCommentChange("text")}
                        rows={5}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Сохраняем
                        </>
                      ) : (
                        "Добавить комментарий"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="policies" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Роли и атрибуты доступа</CardTitle>
                  <CardDescription>
                    Управляйте сочетанием ролей (Viewer, Editor, Owner) и контекстных атрибутов по тегам и папкам.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activePolicy ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(activePolicy.roles_summary || {}).map(([role, count]) => (
                          <Badge key={role} variant="secondary" className="text-xs uppercase tracking-wide">
                            {role}: {count}
                          </Badge>
                        ))}
                      </div>
                      <Separator />
                      <AssignmentList policy={activePolicy} />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Выберите рабочее пространство для просмотра политик доступа.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Быстрое обновление ролей</CardTitle>
                  <CardDescription>
                    Нажмите, чтобы переключить роль между Viewer → Editor → Owner для выбранного пользователя.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {activePolicy && activePolicy.assignments && activePolicy.assignments.length > 0 ? (
                    <div className="space-y-3">
                      {activePolicy.assignments.map((assignment) => {
                        const roleCycle = ["viewer", "editor", "owner"];
                        const currentIndex = roleCycle.indexOf(assignment.role);
                        const nextRole = roleCycle[(currentIndex + 1) % roleCycle.length];
                        return (
                          <Button
                            key={assignment.id}
                            type="button"
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => handlePolicyToggle(assignment.id, nextRole)}
                          >
                            <span className="font-medium">{assignment.user_id}</span>
                            <span className="text-xs uppercase">{assignment.role} → {nextRole}</span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Нет прямых назначений в выбранном пространстве.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workspaces" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Рабочие пространства и папки</CardTitle>
                  <CardDescription>
                    Создавайте иерархию командных зон с наследованием прав доступа.
                  </CardDescription>
                </CardHeader>
                <CardContent>{renderWorkspaceHierarchy()}</CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardHeader>
                  <CardTitle>Новое пространство</CardTitle>
                  <CardDescription>Гибкое наследование прав и атрибутов.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateWorkspace} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Название</label>
                      <Input
                        placeholder="Например, Маркетинг"
                        value={workspaceForm.name}
                        onChange={handleWorkspaceFormChange("name")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Создатель</label>
                      <Input
                        placeholder="Инициатор"
                        value={workspaceForm.createdBy}
                        onChange={handleWorkspaceFormChange("createdBy")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Родитель</label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={workspaceForm.parentId}
                        onChange={handleWorkspaceFormChange("parentId")}
                      >
                        <option value="">Нет</option>
                        {workspaceOptions.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Описание</label>
                      <Textarea
                        placeholder="Цель пространства"
                        value={workspaceForm.description}
                        onChange={handleWorkspaceFormChange("description")}
                        rows={3}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <input
                        type="checkbox"
                        checked={workspaceForm.inheritPermissions}
                        onChange={handleWorkspaceFormChange("inheritPermissions")}
                        className="h-4 w-4 rounded border-border"
                      />
                      Наследовать права родителя
                    </label>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Создание
                        </>
                      ) : (
                        "Создать пространство"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
