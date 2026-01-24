import Terminal from "./components/Terminal";
import "./App.css";

function App() {
  // Determine WebSocket URL based on current protocol
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = `${protocol}${window.location.host}/ws`;

  return (
    <div className="App">
      <Terminal wsUrl={wsUrl} />
    </div>
  );
}

export default App;
