import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";

  useEffect(() => {
    if (isAuthenticated) {
      // eslint-disable-next-line sonarjs/void-use
      void navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid gap-10 md:grid-cols-[1.1fr_0.9fr] items-center">
        <div className="hidden md:flex flex-col gap-6">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Secure Access
          </div>
          <h1 className="text-4xl font-semibold text-zinc-100 leading-tight">
            Terminal Hub
          </h1>
          <p className="text-lg text-zinc-400 max-w-md">
            A shared control room for live terminals. Jump between sessions,
            stream outputs, and stay close to your infrastructure.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              {
                title: "Live Sessions",
                desc: "Monitor terminals in real time.",
              },
              {
                title: "Secure by Default",
                desc: "Private sessions with auth.",
              },
              { title: "Multi-Client", desc: "See who is connected." },
              { title: "Fast Actions", desc: "Create and jump instantly." },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-lg"
              >
                <div className="text-sm font-semibold text-zinc-100">
                  {item.title}
                </div>
                <div className="text-xs text-zinc-400 mt-1">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-8 shadow-2xl backdrop-blur">
          <div className="md:hidden text-xs uppercase tracking-[0.3em] text-zinc-500">
            Terminal Hub
          </div>
          <h2 className="text-2xl font-semibold text-zinc-100 mb-6">
            Welcome back
          </h2>

          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-200 px-4 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition-colors"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950/70 border border-zinc-700/80 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 px-4 rounded-lg shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
