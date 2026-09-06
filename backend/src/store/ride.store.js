// Repository pattern: every other module talks to rides through this
// interface, never through a raw Map. That means if a real database is
// ever required, this is the only file that needs to change.
//
// In-memory is intentional here — see README "Why no database" — but the
// shape (get/save/list) is exactly what a Mongoose-backed version would
// expose too.

const rides = new Map();

export const rideStore = {
  save(ride) {
    ride.updatedAt = new Date().toISOString();
    rides.set(ride.id, ride);
    return ride;
  },

  findById(id) {
    return rides.get(id) || null;
  },

  findAll() {
    return Array.from(rides.values()).sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
  },

  // Only used by the load-test / tests to start from a clean slate.
  clear() {
    rides.clear();
  },

  count() {
    return rides.size;
  }
};
