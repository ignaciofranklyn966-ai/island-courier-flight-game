// Island Courier — central tuning constants.
//
// Every number that shapes how the game feels lives here, so the flight
// model, the missions and the HUD all read from one place. Nothing in this
// file touches the DOM or the renderer.

export const CONFIG = {
  // World size in metres. The playable islands sit inside a 2400 x 2400
  // square of ocean; the sea plane itself is larger so the horizon is water.
  world: {
    size: 2400,
    oceanLevel: 0,
    fogNear: 500,
    fogFar: 2200,
  },

  // Arcade flight model. Speeds are metres per second; angles are radians.
  plane: {
    minSpeed: 8, // below this the wing gives up and the nose drops
    maxSpeed: 95,
    stallSpeed: 16,
    takeoffSpeed: 30, // rolling faster than this, the wing lifts the plane
    climbBleed: 6.0, // speed lost per second while pitched fully up
    diveGain: 8.0, // speed gained per second while pitched fully down
    throttleResponse: 0.45, // how fast speed chases the throttle target
    pitchRate: 0.85, // radians per second of elevator travel
    bankRate: 1.7, // radians per second of aileron travel
    maxPitch: 0.55,
    maxBank: 1.05,
    turnAuthority: 0.9, // turn rate scales with tan(bank) * g / speed
    autoLevelRate: 0.5, // bank eases back to level with no aileron input
    propSpinAtCruise: 28, // propeller radians per second at cruise speed
  },

  // Fuel: percent of a full tank. A full-throttle leg costs roughly a
  // third of a tank, so a pilot who firewalls the throttle the whole way
  // runs dry before the last delivery and must plan refuelling stops.
  fuel: {
    capacity: 100,
    drainIdle: 0.10, // percent per second at closed throttle
    drainFull: 0.85, // percent per second at full throttle
    lowFuelWarning: 25,
  },

  // Damage: percent. A hard landing hurts, a second one can end the run.
  damage: {
    hardLanding: 35, // touchdown sinking faster than landingMaxSink
    maxDamage: 100,
  },

  // Landing windows, in metres per second of vertical speed and knots.
  landing: {
    maxSink: 6, // gentle touchdown: at or below this is a good landing
    hardSink: 10, // sinking faster than this on touchdown is a crash
    maxSpeedKnots: 95, // faster than this on touchdown is a crash
    maxBank: 0.3, // banked more than this on touchdown is a crash
  },

  // Scoring: deliveries pay, rings pay, the clock charges.
  scoring: {
    ring: 100,
    delivery: 500,
    softLanding: 50, // extra for a gentle touchdown (sink under 3 m/s)
    timePenaltyPerSecond: 1.5,
  },

  // Chase camera: metres behind and above the plane, and how eagerly it
  // catches up. The camera never banks with the plane, so it never fights
  // the pilot in a turn.
  camera: {
    fov: 62, // vertical field of view of the chase camera, in degrees
    distance: 15,
    height: 5.2,
    lookAhead: 24,
    followLerp: 4.2,
    // Cockpit camera: the pilot's seat, 737-style — a high eye point
    // well forward of the wing, looking over the nose rather than at
    // it, so the nose drops away low in the frame beneath the
    // windscreen. The view rests further below level than the chase
    // camera so the panel and the yoke read at the bottom of the frame.
    cockpit: {
      offsetX: 0,
      offsetY: 1.6,
      offsetZ: -0.1,
      fov: 76,
      pitchDown: 0.2, // radians the cockpit view rests below level
    },
  },

  // Palette: one warm tropical style for sea, sand, grass and sky.
  colors: {
    sky: 0x8ecfee,
    fog: 0xa8d4ea,
    ocean: 0x1e6f9e,
    oceanDeep: 0x155a82,
    sand: 0xe8d29a,
    grass: 0x3f8f46,
    grassDark: 0x2c6b31,
    rock: 0x8a7f72,
    runway: 0x3c3f45,
    ringGold: 0xffc93c,
    planeRed: 0xd23b2e,
    planeWhite: 0xf5f2e8,
  },

  // Unit helpers the HUD and the physics share.
  units: {
    msToKnots: 1.94384,
    mToFeet: 3.28084,
    msToFpm: 196.85,
  },
};
