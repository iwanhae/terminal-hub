import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { SessionProvider } from "./features/sessions/SessionContext";
import { CronProvider } from "./features/crons/CronContext";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import Sidebar from "./features/navigation/Sidebar";
import SessionGrid from "./features/sessions/SessionGrid";
import TerminalPage from "./features/terminal/TerminalPage";
import CronPage from "./features/crons/CronPage";
import FilesPage from "./features/files/FilesPage";
import LoginPage from "./features/auth/LoginPage";
import { Toaster } from "react-hot-toast";

function App() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("create-session-shortcut"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <CronProvider>
                  <SessionProvider>
                    <div className="flex min-h-screen min-h-[100dvh] overflow-hidden bg-transparent text-zinc-100 font-sans">
                      <Sidebar
                        containerClassName="hidden md:flex"
                        onNavigate={() => {}}
                      />
                      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                        <Routes>
                          <Route path="/" element={<SessionGrid />} />
                          <Route
                            path="/session/:sessionId"
                            element={<TerminalPage />}
                          />
                          <Route path="/crons" element={<CronPage />} />
                          <Route path="/files" element={<FilesPage />} />
                        </Routes>
                      </main>
                    </div>
                  </SessionProvider>
                </CronProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#18181b",
              color: "#e4e4e7",
              border: "1px solid #27272a",
            },
          }}
        />
      </AuthProvider>
    </Router>
  );
}

export default App;
