const STATUS_LABEL = {
  REQUESTED: "Finding a driver",
  ASSIGNED: "Driver assigned",
  NO_DRIVER_FOUND: "No driver found",
};

export default function RideList({ rides }) {
  if (rides.length === 0) {
    return (
      <p className="empty-state">
        No rides booked yet. Book one to see it dispatch live.
      </p>
    );
  }

  return (
    <table className="ride-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Ride</th>
          <th>Route</th>
          <th>Status</th>
          <th>Driver</th>
        </tr>
      </thead>

      <tbody>
        {rides.map((ride, index) => (
          <tr key={ride.id}>
            <td>{index + 1}</td>

            <td className="mono">{ride.id}</td>

            <td>
              {ride.pickup} → {ride.drop}
            </td>

            <td>
              <span
                className={`status-badge status-${ride.status.toLowerCase()}`}
              >
                {STATUS_LABEL[ride.status] || ride.status}
              </span>
            </td>

            <td className="mono">{ride.driverId || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}