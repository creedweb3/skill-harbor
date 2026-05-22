import { DiscoverView } from "./components/discover/DiscoverView";
import { Sidebar } from "./components/sidebar/Sidebar";
import { useStudio } from "./hooks/useStudio";
import "./App.css";

export default function App() {
  const studio = useStudio();

  return (
    <div className="app-shell">
      <Sidebar studio={studio} />
      <DiscoverView studio={studio} />
    </div>
  );
}
