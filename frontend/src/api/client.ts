const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export type Role = "employee" | "administrator";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

function getToken(): string | null {
  return sessionStorage.getItem("formula_calc_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) {
        message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      }
    } catch {
      // ignore parse errors, use default message
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // Employee endpoints
  listCalculators: () =>
    request<{ calculators: { id: string; name: string; description: string | null }[] }>(
      "/api/calculators"
    ),
  getCalculator: (id: string) =>
    request<{
      calculator: { id: string; name: string; description: string | null };
      inputs: {
        id: string;
        name: string;
        label: string;
        type: "number" | "text";
        required: boolean;
        display_order: number;
      }[];
    }>(`/api/calculators/${id}`),
  calculate: (calculatorId: string, inputs: Record<string, number | string>) =>
    request<{ result: number }>("/api/calculate", {
      method: "POST",
      body: JSON.stringify({ calculatorId, inputs }),
    }),
  history: () =>
    request<{
      history: {
        id: string;
        calculator_id: string;
        calculator_name: string;
        inputs: Record<string, unknown>;
        result: number;
        created_at: string;
      }[];
    }>("/api/history"),

  // Admin endpoints
  adminListCalculators: () => request<{ calculators: any[] }>("/api/admin/calculators"),
  adminCreateCalculator: (payload: {
    name: string;
    description?: string;
    inputs: { name: string; label: string; type: "number" | "text"; required: boolean; display_order: number }[];
    expression?: string;
    publish?: boolean;
  }) =>
    request<{ calculator: any }>("/api/admin/calculators", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminUpdateCalculator: (id: string, payload: { name?: string; description?: string; active?: boolean }) =>
    request<{ calculator: any }>(`/api/admin/calculators/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  adminDeleteCalculator: (id: string) =>
    request<void>(`/api/admin/calculators/${id}`, { method: "DELETE" }),

  adminListFormulaVersions: (calculatorId: string) =>
    request<{ formulaVersions: any[] }>(`/api/admin/calculators/${calculatorId}/formulas`),
  adminCreateFormula: (payload: { calculatorId: string; expression: string; publish: boolean }) =>
    request<{ formulaVersion: any }>("/api/admin/formulas", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminUpdateFormula: (id: string, payload: { expression?: string; active?: boolean }) =>
    request<{ formulaVersion: any }>(`/api/admin/formulas/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  adminDeleteFormula: (id: string) => request<void>(`/api/admin/formulas/${id}`, { method: "DELETE" }),

  adminCalculationLogs: () => request<{ logs: any[] }>("/api/admin/logs/calculations"),
  adminAuditLogs: () => request<{ logs: any[] }>("/api/admin/logs/audit"),

  // User management
  adminListUsers: () =>
    request<{ users: { id: string; email: string; role: Role; created_at: string }[] }>(
      "/api/admin/users"
    ),
  adminCreateUser: (payload: { email: string; password: string; role: Role }) =>
    request<{ user: any }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminUpdateUser: (id: string, payload: { role?: Role; password?: string }) =>
    request<{ user: any }>(`/api/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  adminDeleteUser: (id: string) => request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
};

export function saveToken(token: string) {
  sessionStorage.setItem("formula_calc_token", token);
}
export function clearToken() {
  sessionStorage.removeItem("formula_calc_token");
}
export { getToken };
