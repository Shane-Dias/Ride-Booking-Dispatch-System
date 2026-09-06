import { useState } from "react";
import { bookRide } from "../api.js";

export default function RideForm({ onBooked }) {
  const [riderName, setRiderName] = useState("");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [status, setStatus] = useState("idle"); // idle | booking | error

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("booking");
    try {
      const ride = await bookRide({ riderName, pickup, drop });
      onBooked(ride);
      setPickup("");
      setDrop("");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="ride-form" onSubmit={handleSubmit}>
      <h2>Book a ride</h2>

      <label>
        Rider name
        <input
          value={riderName}
          onChange={(e) => setRiderName(e.target.value)}
          placeholder="e.g. Asha Rao"
        />
      </label>

      <label>
        Pickup
        <input
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          placeholder="e.g. Bandra West"
          required
        />
      </label>

      <label>
        Drop
        <input
          value={drop}
          onChange={(e) => setDrop(e.target.value)}
          placeholder="e.g. Andheri East"
          required
        />
      </label>

      <button type="submit" disabled={status === "booking"}>
        {status === "booking" ? "Booking..." : "Book ride"}
      </button>

      {status === "error" && <p className="error-text">Booking failed. Is the backend running?</p>}
    </form>
  );
}
