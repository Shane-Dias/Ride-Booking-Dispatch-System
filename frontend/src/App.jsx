import { useEffect, useState, useCallback } from "react";
import RideForm from "./components/RideForm.jsx";
import RideList from "./components/RideList.jsx";
import { fetchRides } from "./api.js";

const POLL_MS = 1500;

export default function App() {
  const [rides, setRides] = useState([]);

  const refresh = useCallback(() => {
    fetchRides().then(setRides).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="app-shell">
      <header>
        <h1>Ride Dispatch</h1>
        <p className="subtitle">Book a ride and watch it get matched to a driver.</p>
      </header>

      <div className="layout">
        <RideForm onBooked={refresh} />
        <RideList rides={[...rides].reverse()} />
      </div>
    </div>
  );
}
