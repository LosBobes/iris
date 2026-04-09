import { useCallback, useState } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Login } from "@/components/Login/Login";
import DashboardPage from "@/pages/DashboardPage";
import WorkOrderCreatePage from "@/pages/WorkOrderCreatePage";
import WorkOrderEditPage from "@/pages/WorkOrderEditPage";
import WorkOrdersPage from "@/pages/WorkOrdersPage";
import { Toaster } from "@/components/ui/sonner";
import { AuthContext } from "@/contexts/AuthContext";

function AccessDenied(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">
        Nemate dozvolu za pristup ovoj stranici.
      </p>
    </main>
  );
}

function App(): React.JSX.Element {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );

  const handleLogout = useCallback(() => setCurrentUser(null), []);

  const handleLoginSuccess = useCallback(
    (user: AuthenticatedUser) => setCurrentUser(user),
    [],
  );

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUser.role !== "admin") {
    return <AccessDenied />;
  }

  return (
    <AuthContext.Provider value={{ currentUser, onLogout: handleLogout }}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-orders" element={<WorkOrdersPage />} />
          <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderEditPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </AuthContext.Provider>
  );
}

export default App;
