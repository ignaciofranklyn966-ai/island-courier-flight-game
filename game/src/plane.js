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

  // Cockpit instrument panel: a dark glareshield board with three glowing
  // dials and a control yoke, mounted on the nose top at the base of the
  // windscreen and leaning back toward the pilot. It is a cockpit-only
  // prop — hidden in the chase view (where it would poke out of the
  // canopy) and shown with the cockpit camera. The panel sits in the
  // lower-middle of the cockpit frame, below the horizon, with the nose
  // still reading around it.
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

  return { group, propeller, canopy, cockpitPanel };
}

// Build the cockpit instrument panel: a dark glareshield board with
// three glowing dials and a control yoke, mounted on the nose top at the
// base of the windscreen and leaning back toward the pilot, so the
// cockpit camera reads its face in the lower-middle of the frame. The
// board is 1.05 m wide and 0.30 m tall, centred at (0, 0.82, -0.95) —
// above the fuselage skin there, below the pilot's eye line — with the
// dials on its upper face so they clear the nose.
function buildCockpitPanel() {
  const panel = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.3, 0.08), dark);
  panel.add(board);
  const dialColors = [0x7df9ff, 0xffc93c, 0x8dff6a, 0xff9a3c];
  const dialX = [-0.4, -0.15, 0.15, 0.4];
  for (let i = 0; i < 4; i += 1) {
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16),
      new THREE.MeshBasicMaterial({ color: dialColors[i] }),
    );
    dial.rotation.x = Math.PI / 2;
    dial.position.set(dialX[i], 0.05, 0.055);
    panel.add(dial);
  }
  // Control yoke: a short column with a crossbar, just below the board.
  const column = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.26, 0.07),
    dark,
  );
  column.position.set(0, -0.26, 0.05);
  column.rotation.x = 0.35;
  panel.add(column);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), dark);
  bar.position.set(0, -0.15, 0.11);
  panel.add(bar);
  panel.position.set(0, 0.82, -0.95);
  panel.rotation.x = -0.55;
  return panel;
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
