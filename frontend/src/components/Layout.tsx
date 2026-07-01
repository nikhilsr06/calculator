import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold text-brand-700 tracking-tight">
            Formula Calculator
          </Link>
          {user && (
            <nav className="flex items-center gap-5 text-sm">
              <Link to="/" className="text-slate-600 hover:text-slate-900">
                Calculators
              </Link>
              <Link to="/history" className="text-slate-600 hover:text-slate-900">
                History
              </Link>
              {user.role === "administrator" && (
                <>
                  <Link to="/admin" className="text-slate-600 hover:text-slate-900">
                    Admin
                  </Link>
                  <Link to="/admin/users" className="text-slate-600 hover:text-slate-900">
                    Users
                  </Link>
                </>
              )}
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">{user.email}</span>
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="text-brand-600 hover:text-brand-700 font-medium"
              >
                Sign out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
