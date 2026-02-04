import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SessionProvider } from "./contexts/SessionContext";
import Sidebar from "./components/Sidebar";
import SessionGrid from "./components/SessionGrid"; // Updated import
import TerminalPage from "./pages/TerminalPage";
import { Toaster } from "react-hot-toast";

function App() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobileNavOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileNavOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileNavOpen]);

  return (
    <SessionProvider>
      <Router>
        <div className="flex min-h-screen min-h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
          {isMobileNavOpen && (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              aria-label="Close navigation"
              data-testid="mobile-backdrop"
              onClick={() => setIsMobileNavOpen(false)}
            />
          )}

          <Sidebar
            containerClassName={`${isMobileNavOpen ? "fixed inset-y-0 left-0 z-50" : "hidden"} md:static md:flex`}
            onNavigate={() => setIsMobileNavOpen(false)}
            testId="mobile-drawer"
          />

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            <header className="md:hidden h-12 flex items-center gap-2 px-3 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
              <button
                type="button"
                className="inline-flex items-center justify-center size-9 rounded-md text-zinc-200 hover:bg-zinc-900 active:bg-zinc-800 transition-colors"
                aria-label="Open navigation"
                data-testid="mobile-nav-open"
                onClick={() => setIsMobileNavOpen(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <div className="font-semibold tracking-tight text-zinc-100">
                Terminal Hub
              </div>
            </header>

            <Routes>
              <Route path="/" element={<SessionGrid />} />{" "}
              {/* Updated element */}
              <Route path="/session/:sessionId" element={<TerminalPage />} />
            </Routes>
          </main>
        </div>
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
    </SessionProvider>
  );
}

export default App;
