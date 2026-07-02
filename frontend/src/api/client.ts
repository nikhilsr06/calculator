const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export type Role = "employee" | "administrator";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface EmployeeCalculator {
  id: string;
  name: string;
  description: string | null;
  result_unit: string | null;
}

export interface Category {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCalculator {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  category_id: string | null;
  category_name: string | null;
  display_order: number;
  result_unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormulaValidation {
  valid: boolean;
  error?: string;
  variables?: string[];
}

function getToken(): string | null {
  return sessionStorage.getItem("formula_calc_token");
}

declare global {
  interface Window {
    __TAURI_IPC__?: (cmd: unknown) => void;
  }
}

function isTauri(): boolean {
  return typeof window.__TAURI_IPC__ === "function";
}

function errorFromBody(body: unknown, status: number): string {
  let message = `Request failed (${status})`;
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") message = err;
    else if (err !== undefined) message = JSON.stringify(err);
  }
  return message;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;

  if (isTauri()) {
    const { fetch: tauriFetch, Body, ResponseType } = await import("@tauri-apps/api/http");
    const res = await tauriFetch<string>(url, {
      method: (options.method || "GET") as "GET" | "POST" | "PUT" | "DELETE",
      headers,
      body: options.body ? Body.text(String(options.body)) : undefined,
      responseType: ResponseType.Text,
    });

    if (res.status >= 400) {
      let body: unknown = res.data;
      try {
        body = JSON.parse(res.data);
      } catch {
        // keep raw text
      }
      throw new Error(errorFromBody(body, res.status));
    }
    if (res.status === 204 || !res.data) return undefined as T;
    return JSON.parse(res.data) as T;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the server. Check your network connection.");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = errorFromBody(await res.json(), res.status);
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
    request<{
      categories: {
        id: string;
        name: string;
        display_order: number;
        calculators: EmployeeCalculator[];
      }[];
      uncategorized: EmployeeCalculator[];
    }>("/api/calculators"),
  getCalculator: (id: string) =>
    request<{
      calculator: { id: string; name: string; description: string | null; result_unit: string | null };
      inputs: {
        id: string;
        name: string;
        label: string;
        type: "number" | "text";
        required: boolean;
        display_order: number;
        unit: string | null;
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
  adminListCalculators: () => request<{ calculators: AdminCalculator[] }>("/api/admin/calculators"),
  adminGetCalculator: (id: string) => request<{ calculator: AdminCalculator }>(`/api/admin/calculators/${id}`),
  adminListCalculatorInputs: (calculatorId: string) =>
    request<{
      inputs: {
        id: string;
        name: string;
        label: string;
        type: "number" | "text";
        required: boolean;
        display_order: number;
        unit: string | null;
      }[];
    }>(`/api/admin/calculators/${calculatorId}/inputs`),
  adminUpdateCalculatorInputs: (
    calculatorId: string,
    inputs: { id: string; label?: string; unit?: string }[]
  ) =>
    request<{ inputs: { id: string; name: string; label: string; unit: string | null }[] }>(
      `/api/admin/calculators/${calculatorId}/inputs`,
      { method: "PUT", body: JSON.stringify({ inputs }) }
    ),
  adminCreateCalculator: (payload: {
    name: string;
    description?: string;
    category_id?: string | null;
    result_unit?: string;
    inputs: { name: string; label: string; type: "number" | "text"; required: boolean; display_order: number; unit?: string }[];
    expression?: string;
    publish?: boolean;
  }) =>
    request<{ calculator: any }>("/api/admin/calculators", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminUpdateCalculator: (
    id: string,
    payload: {
      name?: string;
      description?: string;
      active?: boolean;
      category_id?: string | null;
      result_unit?: string;
    }
  ) =>
    request<{ calculator: any }>(`/api/admin/calculators/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  adminDeleteCalculator: (id: string) =>
    request<void>(`/api/admin/calculators/${id}`, { method: "DELETE" }),
  adminReorderCalculators: (categoryId: string | null, orderedIds: string[]) =>
    request<{ ok: true }>("/api/admin/calculators/reorder", {
      method: "POST",
      body: JSON.stringify({ categoryId, orderedIds }),
    }),

  adminListFormulaVersions: (calculatorId: string) =>
    request<{ formulaVersions: any[] }>(`/api/admin/calculators/${calculatorId}/formulas`),
  adminValidateExpression: (expression: string) =>
    request<FormulaValidation>("/api/admin/formulas/validate", {
      method: "POST",
      body: JSON.stringify({ expression }),
    }),
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

  // Category management
  adminListCategories: () => request<{ categories: Category[] }>("/api/admin/categories"),
  adminCreateCategory: (name: string) =>
    request<{ category: Category }>("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  adminUpdateCategory: (id: string, name: string) =>
    request<{ category: Category }>(`/api/admin/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  adminDeleteCategory: (id: string) => request<void>(`/api/admin/categories/${id}`, { method: "DELETE" }),
  adminReorderCategories: (orderedIds: string[]) =>
    request<{ ok: true }>("/api/admin/categories/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    }),

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
