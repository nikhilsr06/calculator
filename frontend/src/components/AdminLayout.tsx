import { NavLink, Outlet } from "react-router-dom";
import { Layout } from "./Layout";

function tabClass({ isActive }: { isActive: boolean }) {
  return [
    "rounded-md px-4 py-2 text-sm font-medium no-underline transition-colors",
    isActive
      ? "bg-white text-brand-700 shadow-sm"
      : "text-slate-600 hover:text-slate-900",
  ].join(" ");
}

export function AdminLayout() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Admin</h1>
        <p className="text-sm text-slate-500 mb-5">
          Manage calculators and user accounts.
        </p>
        <nav className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          <NavLink to="/admin/calculators" className={tabClass}>
            Calculators
          </NavLink>
          <NavLink to="/admin/users" className={tabClass}>
            Users
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </Layout>
  );
}
