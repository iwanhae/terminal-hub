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
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <SessionProvider>
                  <div className="flex min-h-screen min-h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
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
      </Router>
    </AuthProvider>
  );
}

export default App;
