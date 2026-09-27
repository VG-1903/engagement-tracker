// Typed client for the FastAPI backend. All errors surface as ApiError with the server's {code, message}.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Role = "ADMIN" | "MANAGER" | "MEMBER";
export type TaskStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "WAITING_FOR_CLIENT"
  | "READY_FOR_REVIEW"
  | "CHANGES_REQUESTED"
  | "COMPLETED";
export type Action = "START" | "WAIT_FOR_CLIENT" | "RESUME" | "SUBMIT_FOR_REVIEW" | "APPROVE" | "REQUEST_CHANGES";
export type Recurrence = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}
export interface UserRef {
  id: number;
  name: string;
}
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
export interface Client {
  id: number;
  name: string;
  gstin: string | null;
  contact_email: string | null;
  created_at: string;
}
export interface Template {
  id: number;
  service_type_id: number;
  title: string;
  description: string | null;
  default_due_offset_days: number;
  sequence: number;
}
export interface ServiceType {
  id: number;
  name: string;
  description: string | null;
  is_recurring: boolean;
  recurrence: Recurrence | null;
  templates: Template[];
}
export interface EngagementRef {
  id: number;
  label: string;
  client_name: string;
  service_type_name: string;
  period_label: string | null;
  manager_id: number;
}
export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string;
  is_overdue: boolean;
  sequence: number;
  engagement: EngagementRef;
  assignee: UserRef | null;
  reviewer: UserRef | null;
  submitted_at: string | null;
  completed_at: string | null;
  updated_at: string;
  version: number;
}
export interface TaskDetail extends Task {
  allowed_actions: Action[];
  can_edit: boolean;
}
export interface TaskEvent {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  details: Record<string, unknown> | null;
  actor: UserRef | null;
  created_at: string;
}
export interface EngagementSummary {
  id: number;
  client: { id: number; name: string };
  service_type: { id: number; name: string; is_recurring: boolean; recurrence: Recurrence | null };
  period_start: string | null;
  period_label: string | null;
  label: string;
  manager: UserRef;
  status: "ACTIVE" | "COMPLETED";
  created_at: string;
  task_counts: Partial<Record<TaskStatus, number>>;
}
export interface EngagementDetail extends EngagementSummary {
  tasks: Task[];
  can_manage: boolean;
}
export type Bucket = "open" | "overdue" | "due_today" | "waiting_for_client" | "waiting_for_review";
export interface Dashboard {
  today: string;
  counts: Record<Bucket, number>;
  lists: Record<Bucket, Task[]>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "et_token";

/** Server's business date (from the x-business-date header); relative due labels use it, not the browser clock. */
let businessDate: string | null = null;
export const getBusinessDate = () => businessDate;

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function qs(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs(query)}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", `Cannot reach the API at ${API_URL}.`);
  }
  businessDate = res.headers.get("x-business-date") ?? businessDate;
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("et:unauthorized"));
    }
    throw new ApiError(res.status, err.code ?? "HTTP_ERROR", err.message ?? res.statusText, err.details);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("POST", "/auth/login", { email, password }),
  me: () => request<User>("GET", "/auth/me"),
  dashboard: () => request<Dashboard>("GET", "/dashboard"),

  tasks: (q: Query) => request<Page<Task>>("GET", "/tasks", undefined, q),
  task: (id: number) => request<TaskDetail>("GET", `/tasks/${id}`),
  taskHistory: (id: number) => request<TaskEvent[]>("GET", `/tasks/${id}/history`),
  transition: (id: number, action: Action, version: number, note?: string) =>
    request<TaskDetail>("POST", `/tasks/${id}/transitions`, { action, version, note: note || null }),
  updateTask: (id: number, body: Record<string, unknown>) => request<TaskDetail>("PATCH", `/tasks/${id}`, body),

  engagements: (q: Query) => request<Page<EngagementSummary>>("GET", "/engagements", undefined, q),
  engagement: (id: number) => request<EngagementDetail>("GET", `/engagements/${id}`),
  createEngagement: (body: Record<string, unknown>) => request<EngagementDetail>("POST", "/engagements", body),
  generateNext: (id: number) =>
    request<{ created: boolean; engagement: EngagementDetail }>("POST", `/engagements/${id}/generate-next`),
  generateDue: (as_of?: string) =>
    request<{ as_of: string; created: number[]; already_existed: number; failed: unknown[] }>(
      "POST",
      "/admin/recurring/generate",
      as_of ? { as_of } : {},
    ),

  clients: (q?: Query) => request<Page<Client>>("GET", "/clients", undefined, { limit: 100, ...q }),
  createClient: (body: Partial<Client>) => request<Client>("POST", "/clients", body),
  updateClient: (id: number, body: Partial<Client>) => request<Client>("PUT", `/clients/${id}`, body),
  deleteClient: (id: number) => request<void>("DELETE", `/clients/${id}`),

  serviceTypes: () => request<ServiceType[]>("GET", "/service-types"),
  createServiceType: (body: Record<string, unknown>) => request<ServiceType>("POST", "/service-types", body),
  updateServiceType: (id: number, body: Record<string, unknown>) =>
    request<ServiceType>("PATCH", `/service-types/${id}`, body),
  deleteServiceType: (id: number) => request<void>("DELETE", `/service-types/${id}`),
  addTemplate: (stId: number, body: Record<string, unknown>) =>
    request<Template>("POST", `/service-types/${stId}/templates`, body),
  updateTemplate: (id: number, body: Record<string, unknown>) =>
    request<Template>("PATCH", `/task-templates/${id}`, body),
  deleteTemplate: (id: number) => request<void>("DELETE", `/task-templates/${id}`),

  users: (q?: Query) => request<Page<User>>("GET", "/users", undefined, { limit: 100, ...q }),
  assignableUsers: () => request<User[]>("GET", "/users/assignable"),
  createUser: (body: Record<string, unknown>) => request<User>("POST", "/users", body),
  updateUser: (id: number, body: Record<string, unknown>) => request<User>("PATCH", `/users/${id}`, body),
};
