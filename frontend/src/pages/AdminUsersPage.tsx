import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { api, Role } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface UserRow {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .adminListUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      await api.adminCreateUser({ email, password, role });
      setEmail("");
      setPassword("");
      setRole("employee");
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (u: UserRow, newRole: Role) => {
    await api.adminUpdateUser(u.id, { role: newRole });
    load();
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`Remove ${u.email}? This cannot be undone.`)) return;
    await api.adminDeleteUser(u.id);
    load();
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Admin · Users</h1>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700"
        >
          {showCreate ? "Cancel" : "New User"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">At least 8 characters.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="employee">Employee</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !email || password.length < 8}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create User"}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
        {users.map((u) => (
          <div key={u.id} className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">{u.email}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Created {new Date(u.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={u.role}
                onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                disabled={u.id === currentUser?.id}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="employee">Employee</option>
                <option value="administrator">Administrator</option>
              </select>
              <button
                onClick={() => handleDelete(u)}
                disabled={u.id === currentUser?.id}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
