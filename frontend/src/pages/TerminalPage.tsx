import { useParams, useNavigate } from "react-router-dom";
import TerminalComponent from "../components/Terminal";

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  if (!sessionId || sessionId.trim() === "") {
    // Redirect to home if no session ID
    void navigate("/");
    return null;
  }

  // Determine WebSocket URL based on current protocol
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = `${protocol}${window.location.host}/ws/${sessionId}`;

  return (
    <div className="flex-1 relative w-full bg-black min-h-0">
      <TerminalComponent wsUrl={wsUrl} />
    </div>
  );
}
