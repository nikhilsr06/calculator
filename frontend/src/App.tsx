import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, RequireRole } from "./components/Guards";
import { AdminLayout } from "./components/AdminLayout";
import LoginPage from "./pages/LoginPage";
import CalculatorListPage from "./pages/CalculatorListPage";
import CalculatorRunPage from "./pages/CalculatorRunPage";
import HistoryPage from "./pages/HistoryPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminCalculatorDetailPage from "./pages/AdminCalculatorDetailPage";
import AdminUsersPage from "./pages/AdminUsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<CalculatorListPage />} />
        <Route path="/calculators/:id" element={<CalculatorRunPage />} />
        <Route path="/history" element={<HistoryPage />} />

        <Route element={<RequireRole role="administrator" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="calculators" replace />} />
            <Route path="calculators" element={<AdminDashboardPage />} />
            <Route path="calculators/:id" element={<AdminCalculatorDetailPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
