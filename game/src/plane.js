// Island Courier — the mail plane and its flight model.
//
// The aircraft is built from plain geometry (cylinders, boxes, cones) in
// a red-and-white courier livery: no external models or images. The flight
// model is arcade with teeth: speed follows throttle with a lag, climbing
// bleeds speed, diving gains it, turns cost lift, and below stall speed
// the nose drops on its own. Throttle and turn discipline are what keep a
// sortie alive, not just holding the stick forward.

import THREE from './three-shim.js';
import { CONFIG } from './config.js';

// Build the courier plane. The model faces -Z (three.js forward) and is
// about 11 m across the wings. Returns { group, propeller }.
export function buildCourierPlane() {
  const group = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: CONFIG.colors.planeRed });
  const white = new THREE.MeshLambertMaterial({
    color: CONFIG.colors.planeWhite,
  });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x1a4a6b,
    shininess: 120,
    specular: 0xbbddff,
  });

  // Fuselage: a tapered cylinder along Z with a rounded nose cone.
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.95, 5.4, 14),
    white,
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.3, 14), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.2;
  group.add(nose);
  // Red cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.97, 0.97, 5.0, 14, 1, true, 0, Math.PI),
    red,
  );
  stripe.name = 'cheatline-stripe';
  stripe.rotation.x = Math.PI / 2;
  stripe.rotation.y = Math.PI / 2;
  stripe.position.z = 0.2;
  stripe.scale.set(1, 1, 0.32);
  group.add(stripe);

  // Cockpit canopy.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 14, 10),
    glass,
  );
  canopy.name = 'cockpit-canopy';
  canopy.scale.set(0.85, 0.62, 1.5);
  canopy.position.set(0, 0.62, -0.9);
  group.add(canopy);

  // 737-style cockpit interior: glareshield, PFD/ND screens, gauges,
  // yoke and windscreen frame. It is a cockpit-only prop — hidden in
  // the chase view (where it would poke out of the canopy) and shown
  // with the cockpit camera, where it fills the lower frame below the
  // horizon while the nose drops away beneath the windscreen.
  const cockpitPanel = buildCockpitPanel();
  cockpitPanel.visible = false;
  group.add(cockpitPanel);

  // Main wing and red wingtips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 1.9), white);
  wing.position.set(0, 0.05, -0.3);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 1.9), red);
    tip.position.set(side * 5.0, 0.05, -0.3);
    group.add(tip);
  }

  // Tail: horizontal stabiliser and a red vertical fin.
  const stabiliser = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.12, 1.15),
    white,
  );
  stabiliser.position.set(0, 0.15, 2.7);
  group.add(stabiliser);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.5), red);
  fin.position.set(0, 0.85, 2.7);
  group.add(fin);

  // Tail cone.
  const tailCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.4, 12),
    white,
  );
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.4;
  group.add(tailCone);

  // Propeller: hub plus two blades, spun by the flight model.
  const propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), dark);
  propeller.add(hub);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 3.6, 0.1),
      bladeMaterial,
    );
    blade.rotation.z = angle;
    blade.position.y = 0;
    propeller.add(blade);
    const bladeTip = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.5, 0.11),
      red,
    );
    bladeTip.rotation.z = angle;
    bladeTip.position.y = angle === 0 ? 1.65 : -1.65;
    propeller.add(bladeTip);
  }
  propeller.position.set(0, 0, -3.95);
  group.add(propeller);

  // Fixed landing gear: two wheels on struts and a tail wheel.
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8),
      dark,
    );
    strut.position.set(side * 0.8, -0.85, -0.4);
    group.add(strut);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12),
      wheelMaterial,
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.8, -1.4, -0.4);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.14, 10),
    wheelMaterial,
  );
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.95, 2.9);
  group.add(tailWheel);

  return { group, propeller, canopy, cockpitPanel, stripe };
}

// Build the 737-style anime cockpit interior: a dark glareshield brow
// across the top of a wide panel, two big screens (a PFD attitude ball
// with speed/altitude tapes on the left, an ND compass rose on the
// right), three small round gauges with rims, ticks and needles, a
// U-shaped yoke low in front of the pilot, and the windscreen frame —
// centre post, side posts and top bar — so the seat reads as a flight
// deck at a glance. Cel style: flat bright colours with black edge
// lines on the big shapes. The whole group is a cockpit-only prop,
// hidden in the chase view (where it would poke out of the canopy), and
// it is built in the plane's own frame at the origin, so every part is
// placed in plane-local coordinates (forward is -Z, the pilot sits at
// +Z looking forward over the nose).
function buildCockpitPanel() {
  const interior = new THREE.Group();
  interior.name = 'cockpit-interior';
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const darker = new THREE.MeshLambertMaterial({ color: 0x141c26 });
  const screenFace = new THREE.MeshLambertMaterial({ color: 0x0b1e33 });
  const tapeFace = new THREE.MeshLambertMaterial({ color: 0x12283d });
  const blackLine = new THREE.LineBasicMaterial({ color: 0x0a0a0a });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pale = new THREE.MeshBasicMaterial({ color: 0xdfe8f0 });

  function box(w, h, d, material) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  }
  // Black cel outline around a mesh: the edge lines ride as children so
  // they follow the mesh wherever it is placed.
  function outline(mesh) {
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        blackLine,
      ),
    );
    return mesh;
  }
  function flatCircle(radius, segments, color, thetaStart, thetaLength) {
    return new THREE.Mesh(
      new THREE.CircleGeometry(
        radius,
        segments,
        thetaStart === undefined ? 0 : thetaStart,
        thetaLength === undefined ? Math.PI * 2 : thetaLength,
      ),
      new THREE.MeshBasicMaterial({ color }),
    );
  }

  // PFD: attitude ball (sky above, earth below, white horizon line and
  // fixed aircraft symbol) with a speed tape left and an altitude tape
  // right, each with three white ticks.
  function buildPfd() {
    const pfd = new THREE.Group();
    pfd.add(outline(box(0.56, 0.46, 0.02, screenFace)));
    const z = 0.012;
    const sky = flatCircle(0.13, 24, 0x35a7e8, 0, Math.PI);
    sky.position.set(0, 0.02, z);
    pfd.add(sky);
    const earth = flatCircle(0.13, 24, 0x8a5a2b, Math.PI, Math.PI);
    earth.position.set(0, 0.02, z);
    pfd.add(earth);
    const horizon = box(0.26, 0.012, 0.004, white);
    horizon.position.set(0, 0.02, z + 0.002);
    pfd.add(horizon);
    const dot = flatCircle(0.014, 12, 0xffffff);
    dot.position.set(0, 0.02, z + 0.004);
    pfd.add(dot);
    for (const side of [-1, 1]) {
      const wing = box(0.05, 0.012, 0.004, white);
      wing.position.set(side * 0.06, 0.02, z + 0.004);
      pfd.add(wing);
      const tape = box(0.05, 0.3, 0.004, tapeFace);
      tape.position.set(side * 0.215, 0.02, z);
      pfd.add(tape);
      for (const ty of [-0.08, 0.02, 0.12]) {
        const tick = box(0.05, 0.009, 0.002, white);
        tick.position.set(side * 0.215, ty, z + 0.002);
        pfd.add(tick);
      }
    }
    return pfd;
  }

  // ND: compass rose with ticks, a green route arc, a fixed white
  // aircraft triangle in the middle and a magenta heading bug on top.
  function buildNd() {
    const nd = new THREE.Group();
    nd.add(outline(box(0.56, 0.46, 0.02, screenFace)));
    const z = 0.012;
    const rose = new THREE.Mesh(
      new THREE.RingGeometry(0.13, 0.155, 32),
      pale,
    );
    rose.position.set(0, 0.02, z);
    nd.add(rose);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const tick = box(0.012, 0.03, 0.002, pale);
      tick.position.set(Math.sin(a) * 0.175, 0.02 + Math.cos(a) * 0.175, z);
      tick.rotation.z = -a;
      nd.add(tick);
    }
    const route = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.105, 16, 1, -0.6, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x37d67a }),
    );
    route.position.set(0, 0.02, z + 0.001);
    nd.add(route);
    const jet = flatCircle(0.04, 3, 0xffffff, Math.PI / 2, Math.PI * 2);
    jet.position.set(0, 0.02, z + 0.002);
    nd.add(jet);
    const bug = flatCircle(0.025, 3, 0xff4fd8, Math.PI / 2, Math.PI * 2);
    bug.position.set(0, 0.02 + 0.155, z + 0.002);
    nd.add(bug);
    return nd;
  }

  // Small round gauge: pale rim, dark face, five white ticks, a coloured
  // needle pivoted at the centre and a white hub — a dial, not a dot.
  function buildGauge(needleColor, needleAngle) {
    const gauge = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.068, 0.08, 24),
      pale,
    );
    rim.position.z = 0.002;
    gauge.add(rim);
    const face = flatCircle(0.068, 24, 0x0b1e33);
    face.position.z = 0.001;
    gauge.add(face);
    for (let i = 0; i < 5; i += 1) {
      const a = ((-120 + i * 60) * Math.PI) / 180;
      const tick = box(0.008, 0.018, 0.002, white);
      tick.position.set(Math.sin(a) * 0.055, Math.cos(a) * 0.055, 0.003);
      tick.rotation.z = -a;
      gauge.add(tick);
    }
    const needleGeo = new THREE.BoxGeometry(0.01, 0.055, 0.003);
    needleGeo.translate(0, 0.0275, 0);
    const needle = new THREE.Mesh(
      needleGeo,
      new THREE.MeshBasicMaterial({ color: needleColor }),
    );
    needle.position.z = 0.004;
    needle.rotation.z = needleAngle;
    gauge.add(needle);
    const hub = flatCircle(0.012, 12, 0xffffff);
    hub.position.z = 0.005;
    gauge.add(hub);
    return gauge;
  }

  // Main panel board, leaning back toward the pilot, with the two screens
  // and two flanking gauges on its face. It runs tall enough to hide the
  // fuselage top behind it down to the bottom of the frame, and the
  // middle of the board is left clear for the yoke in front of it.
  const board = new THREE.Group();
  board.position.set(0, 0.78, -1.08);
  board.rotation.x = -0.3;
  board.add(outline(box(2.0, 0.75, 0.08, dark)));
  const pfd = buildPfd();
  pfd.position.set(-0.5, 0.08, 0.05);
  board.add(pfd);
  const nd = buildNd();
  nd.position.set(0.5, 0.08, 0.05);
  board.add(nd);
  const gaugeSpecs = [
    { x: -0.88, color: 0x37d67a, angle: -0.5 },
    { x: 0.88, color: 0xff5a4e, angle: 0.3 },
  ];
  for (const spec of gaugeSpecs) {
    const gauge = buildGauge(spec.color, spec.angle);
    gauge.position.set(spec.x, 0.08, 0.05);
    board.add(gauge);
  }
  interior.add(board);

  // Glareshield: a thin dark brow capping the panel, tilted so its top
  // face falls away from the pilot's eyes — a brow line above the
  // screens, not a shelf across the windscreen. Unlit, so it stays one
  // flat dark tone instead of catching a light top face.
  const shield = outline(
    box(
      2.05,
      0.12,
      0.1,
      new THREE.MeshBasicMaterial({ color: 0x141c26 }),
    ),
  );
  shield.position.set(0, 1.16, -1.12);
  shield.rotation.x = -0.5;
  interior.add(shield);

  // U-shaped yoke: column up from the panel's lower edge, a crossbar and
  // two grips with red caps, low in front of the pilot at the bottom of
  // the frame, in the clear gap between the two screens.
  const yoke = new THREE.Group();
  const column = box(0.06, 0.36, 0.06, dark);
  column.position.set(0, 0.7, -0.86);
  column.rotation.x = 0.25;
  yoke.add(column);
  const bar = outline(box(0.3, 0.05, 0.05, dark));
  bar.position.set(0, 0.88, -0.82);
  yoke.add(bar);
  for (const side of [-1, 1]) {
    const grip = box(0.05, 0.16, 0.05, dark);
    grip.position.set(side * 0.14, 0.95, -0.82);
    yoke.add(grip);
    const cap = box(
      0.055,
      0.04,
      0.055,
      new THREE.MeshLambertMaterial({ color: 0xd23b2e }),
    );
    cap.position.set(side * 0.14, 1.04, -0.82);
    yoke.add(cap);
  }
  interior.add(yoke);

  // Windscreen frame: a thin centre post splitting the two front
  // windows, side posts and a top bar, all leaning slightly back with
  // the windscreen slope. The bottom of the frame is the glareshield.
  // Unlit flat dark, like the glareshield, so the frame reads as one
  // clean graphic outline around the windows.
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x141c26 });
  const centerPost = outline(box(0.06, 0.95, 0.06, frameMat));
  centerPost.position.set(0, 1.5, -1.35);
  centerPost.rotation.x = -0.1;
  interior.add(centerPost);
  for (const side of [-1, 1]) {
    const post = outline(box(0.06, 1.0, 0.06, frameMat));
    post.position.set(side * 1.05, 1.5, -1.35);
    post.rotation.x = -0.1;
    post.rotation.z = -side * 0.12;
    interior.add(post);
  }
  const topBar = outline(box(2.2, 0.09, 0.06, frameMat));
  topBar.position.set(0, 1.98, -1.35);
  topBar.rotation.x = -0.1;
  interior.add(topBar);

  return interior;
}

// Arcade flight model. Position is a THREE.Vector3 in world metres;
// heading 0 is north (-Z), increasing clockwise; pitch positive climbs;
// bank positive banks right.
export class FlightModel {
  constructor(startPosition, startHeading) {
    this.position = startPosition.clone();
    this.heading = startHeading;
    this.pitch = 0;
    this.bank = 0;
    this.speed = 0;
    this.throttle = 0;
    this.verticalSpeed = 0;
    this.grounded = true;
    this.stalled = false;
    this.propellerAngle = 0;
    this.mesh = null;
    this.propeller = null;
  }

  attachMesh(mesh, propeller) {
    this.mesh = mesh;
    this.propeller = propeller;
    this.syncMesh();
  }

  reset(startPosition, startHeading) {
    this.position.copy(startPosition);
    this.heading = startHeading;
    this.pitch = 0;
    this.bank = 0;
    this.speed = 0;
    this.throttle = 0;
    this.verticalSpeed = 0;
    this.grounded = true;
    this.stalled = false;
    this.syncMesh();
  }

  // Unit forward vector from heading and pitch.
  forwardVector() {
    const cosPitch = Math.cos(this.pitch);
    return new THREE.Vector3(
      Math.sin(this.heading) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.heading) * cosPitch,
    );
  }

  // Ground elevation directly below the plane.
  groundBelow(terrainHeight) {
    return terrainHeight(this.position.x, this.position.z);
  }

  // One physics step. `input` is { pitchUp, pitchDown, rollLeft,
  // rollRight, throttleUp, throttleDown } booleans; `terrainHeight` is the
  // world's height function. Returns nothing; state lives on the model.
  update(deltaTime, input, terrainHeight) {
    const cfg = CONFIG.plane;
    const dt = Math.min(deltaTime, 0.05);

    // Throttle: Shift spools up, Ctrl spools down, + / - work too.
    if (input.throttleUp) this.throttle += 0.55 * dt;
    if (input.throttleDown) this.throttle -= 0.55 * dt;
    this.throttle = Math.max(0, Math.min(1, this.throttle));

    // Elevator: W / Up pulls up, S / Down pushes down. Authority fades
    // at very low speed so the plane feels heavy on the ground roll.
    const authority = Math.min(1, Math.max(0.25, this.speed / 25));
    let pitchTarget = 0;
    if (input.pitchUp) pitchTarget = cfg.maxPitch;
    if (input.pitchDown) pitchTarget = -cfg.maxPitch * 0.8;
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, cfg.pitchRate * authority * dt * 2.2);
    this.pitch = Math.max(-cfg.maxPitch, Math.min(cfg.maxPitch, this.pitch));

    // Ailerons: A / Left banks left, D / Right banks right. With no
    // input the wings ease back toward level on their own.
    let bankTarget = 0;
    if (input.rollLeft) bankTarget = -cfg.maxBank;
    if (input.rollRight) bankTarget = cfg.maxBank;
    const bankRate = input.rollLeft || input.rollRight ? cfg.bankRate : cfg.autoLevelRate;
    this.bank += (bankTarget - this.bank) * Math.min(1, bankRate * dt * 2.0);
    this.bank = Math.max(-cfg.maxBank, Math.min(cfg.maxBank, this.bank));

    // Turn: coordinated turn rate from bank, lift and speed. A steep bank
    // at low speed turns sluggishly and costs lift.
    const turnRate =
      (9.8 * Math.tan(this.bank) / Math.max(this.speed, 12)) *
      cfg.turnAuthority;
    this.heading += turnRate * dt;

    // Speed: throttle sets the target, climbing bleeds it, diving gains
    // it, and a hard bank adds drag. Below stall speed the nose drops.
    const targetSpeed = 14 + this.throttle * 72;
    let acceleration =
      (targetSpeed - this.speed) * cfg.throttleResponse -
      Math.sin(this.pitch) * (this.pitch > 0 ? cfg.climbBleed : cfg.diveGain) -
      Math.abs(this.bank) * 2.5;
    this.speed += acceleration * dt;
    this.speed = Math.max(0, Math.min(cfg.maxSpeed, this.speed));
    this.stalled = this.speed < cfg.stallSpeed && !this.grounded;
    if (this.stalled) {
      this.pitch -= (cfg.stallSpeed - this.speed) * 0.05 * dt * 10;
      this.pitch = Math.max(-cfg.maxPitch, this.pitch);
    }

    // Move along the forward vector.
    const forward = this.forwardVector();
    const previousAltitude = this.position.y;
    this.position.addScaledVector(forward, this.speed * dt);
    this.verticalSpeed = (this.position.y - previousAltitude) / Math.max(dt, 0.0001);

    // Ground contact: stay on the ground while rolling, lift off past
    // takeoff speed with the nose up; touch down when sinking to it.
    const ground = this.groundBelow(terrainHeight);
    if (this.grounded) {
      this.position.y = ground + 1.45;
      if (this.speed > cfg.takeoffSpeed && this.pitch > 0.06) {
        this.grounded = false;
      }
    } else if (this.position.y <= ground + 1.45) {
      this.position.y = ground + 1.45;
      this.grounded = true;
      this.pitch = Math.max(0, this.pitch * 0.3);
    }

    // Spin the propeller with airspeed and throttle.
    this.propellerAngle +=
      (4 + this.throttle * 26 + this.speed * 0.25) * dt;
    this.syncMesh();
  }

  // Push state into the visible mesh: position, heading, pitch and bank.
  // The mesh never rolls with the camera, only with the plane itself.
  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = -this.heading;
    this.mesh.rotation.x = this.pitch;
    this.mesh.rotation.z = -this.bank;
    if (this.propeller) {
      this.propeller.rotation.z = this.propellerAngle;
    }
  }

  // Readouts the HUD consumes.
  get altitudeFeet() {
    return this.position.y * CONFIG.units.mToFeet;
  }

  get speedKnots() {
    return this.speed * CONFIG.units.msToKnots;
  }

  get headingDegrees() {
    return ((this.heading * 180) / Math.PI % 360 + 360) % 360;
  }

  get verticalSpeedFpm() {
    return this.verticalSpeed * CONFIG.units.msToFpm;
  }
}
