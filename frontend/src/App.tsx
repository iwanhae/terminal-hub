import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthProvider";
import { SessionProvider } from "./contexts/SessionContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";
import SessionGrid from "./components/SessionGrid";
import TerminalPage from "./pages/TerminalPage";
import LoginPage from "./pages/LoginPage";
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
                      </Routes>
                    </main>
                  </div>
                </SessionProvider>
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
