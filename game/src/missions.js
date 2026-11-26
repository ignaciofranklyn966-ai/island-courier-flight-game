// Island Courier — missions, scoring, fuel and damage.
//
// One sortie, three deliveries. Each leg starts with a run of gold rings
// and ends with a landing on an island strip: thread the rings, put the
// plane down gently, refuel, and fly the next leg. Rings pay, deliveries
// pay more, gentle landings pay a bonus, and the clock charges by the
// second — so the fastest line is not always the widest throttle.
//
// The manager also owns fuel burn and damage, and it decides what a
// touchdown means: a gentle landing on the strip, a hard landing that
// bends the plane, or a crash into the sea, the hills, or the ground
// short of the runway.

import THREE from './three-shim.js';
import { CONFIG } from './config.js';

// The sortie script: rings in order, then a landing, three times.
function buildStageList(world) {
  const stages = [];
  const rings = world.ringList;
  const ringLegs = [
    { leg: 0, runway: world.runwayB, delivery: 1 },
    { leg: 1, runway: world.runwayA, delivery: 2 },
    { leg: 2, runway: world.runwayA, delivery: 3 },
  ];
  for (const legSpec of ringLegs) {
    for (const ring of rings) {
      if (ring.leg === legSpec.leg) {
        stages.push({ kind: 'ring', ring, label: '' });
      }
    }
    stages.push({
      kind: 'land',
      runway: legSpec.runway,
      delivery: legSpec.delivery,
      label: '',
    });
  }
  return stages;
}

export class MissionManager {
  constructor(world) {
    this.world = world;
    this.stages = buildStageList(world);
    this.stageIndex = 0;
    this.score = 0;
    this.elapsedSeconds = 0;
    this.fuel = CONFIG.fuel.capacity;
    this.damage = 0;
    this.status = 'flying'; // flying | landed | crashed | complete
    this.ringsPassed = 0;
    this.deliveriesMade = 0;
    this.softLandings = 0;
    this.crashReason = '';
    this.currentRing = null;
    this.wasAirborne = false;
    this.onEvent = null; // (type, data) — main wires audio + HUD to this
    this.resetStageLabels();
    this.activateCurrentStage();
  }

  reset() {
    this.stageIndex = 0;
    this.score = 0;
    this.elapsedSeconds = 0;
    this.fuel = CONFIG.fuel.capacity;
    this.damage = 0;
    this.status = 'flying';
    this.ringsPassed = 0;
    this.deliveriesMade = 0;
    this.softLandings = 0;
    this.crashReason = '';
    this.wasAirborne = false;
    for (const ring of this.world.ringList) {
      ring.passed = false;
      ring.active = false;
      ring.group.visible = true;
    }
    this.resetStageLabels();
    this.activateCurrentStage();
  }

  resetStageLabels() {
    let ringNumber = 0;
    for (const stage of this.stages) {
      if (stage.kind === 'ring') {
        ringNumber += 1;
        stage.label = `Fly through ring ${ringNumber} of ${this.stages.filter((s) => s.kind === 'ring').length}`;
      } else {
        stage.label = `Land on ${stage.runway.name} runway — delivery ${stage.delivery} of 3`;
      }
    }
  }

  get currentStage() {
    return this.stages[this.stageIndex] || null;
  }

  get finished() {
    return this.status === 'crashed' || this.status === 'complete';
  }

  // Mark the current ring as the live one; hide rings already passed and
  // dim the ones that belong to later legs so the pilot reads the route.
  activateCurrentStage() {
    for (const ring of this.world.ringList) {
      ring.active = false;
    }
    const stage = this.currentStage;
    this.currentRing = null;
    if (stage && stage.kind === 'ring') {
      stage.ring.active = true;
      this.currentRing = stage.ring;
    }
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data);
  }

  // Bearing from the plane to the current target, in degrees (0 = north).
  targetBearingDegrees(planePosition) {
    const target = this.currentTargetPosition();
    if (!target) return null;
    const dx = target.x - planePosition.x;
    const dz = target.z - planePosition.z;
    const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }

  currentTargetPosition() {
    const stage = this.currentStage;
    if (!stage) return null;
    if (stage.kind === 'ring') return stage.ring.center;
    return new THREE.Vector3(stage.runway.x, stage.runway.elevation, stage.runway.z);
  }

  distanceToTarget(planePosition) {
    const target = this.currentTargetPosition();
    if (!target) return null;
    return planePosition.distanceTo(target);
  }

  // True when the plane's ground position falls inside a runway strip
  // (allowing a little overshoot past the threshold).
  isOverRunway(planePosition, runway) {
    const dx = planePosition.x - runway.x;
    const dz = planePosition.z - runway.z;
    const along = dx * Math.sin(runway.heading) - dz * Math.cos(runway.heading);
    const across = dx * Math.cos(runway.heading) + dz * Math.sin(runway.heading);
    return Math.abs(along) < runway.length / 2 + 12 && Math.abs(across) < runway.width / 2 + 6;
  }

  // One step: fuel, clock, ring passes, touchdowns and terrain hits.
  update(deltaTime, plane) {
    if (this.status === 'crashed' || this.status === 'complete') return;
    const dt = Math.min(deltaTime, 0.05);
    this.elapsedSeconds += dt;

    // Fuel burns with throttle; an empty tank kills the engine.
    const drain =
      CONFIG.fuel.drainIdle +
      (CONFIG.fuel.drainFull - CONFIG.fuel.drainIdle) * plane.throttle;
    this.fuel = Math.max(0, this.fuel - drain * dt);
    if (this.fuel <= 0 && plane.throttle > 0) {
      plane.throttle = 0;
      this.emit('fuel-empty', {});
    }

    // Ring pass: the live ring counts when the plane comes within its hoop.
    const stage = this.currentStage;
    if (stage && stage.kind === 'ring' && !stage.ring.passed) {
      const distance = plane.position.distanceTo(stage.ring.center);
      if (distance < 9.5) {
        this.passRing(stage.ring);
      }
    }

    // Track whether the plane has ever left the ground this leg, so a
    // taxi on the runway does not count as a landing.
    if (!plane.grounded) this.wasAirborne = true;

    // Touchdown: the plane just met the ground while it was airborne.
    // A hillside strike reaches this same path: the flight model puts the
    // plane on the ground, and the touchdown handler calls it a crash
    // unless it happened gently on a runway strip.
    if (plane.grounded && this.wasAirborne) {
      this.wasAirborne = false;
      this.handleTouchdown(plane);
      if (this.status === 'crashed' || this.status === 'complete') return;
    }
  }

  passRing(ring) {
    ring.passed = true;
    ring.group.visible = false;
    this.ringsPassed += 1;
    this.score += CONFIG.scoring.ring;
    this.emit('ring', { score: this.score, ringsPassed: this.ringsPassed });
    this.stageIndex += 1;
    this.activateCurrentStage();
  }

  handleTouchdown(plane) {
    const sink = -plane.verticalSpeed; // positive metres per second down
    const stage = this.currentStage;
    const runway = stage && stage.kind === 'land' ? stage.runway : null;
    const onTargetRunway =
      runway && this.isOverRunway(plane.position, runway);
    const onAnyRunway =
      this.isOverRunway(plane.position, this.world.runwayA) ||
      this.isOverRunway(plane.position, this.world.runwayB);
    const speedKnots = plane.speedKnots;
    const banked = Math.abs(plane.bank) > CONFIG.landing.maxBank;
    const tooFast = speedKnots > CONFIG.landing.maxSpeedKnots;

    // Water or open ground: any touchdown away from a strip ends the run.
    if (!onAnyRunway) {
      const ground = this.world.terrainHeight(plane.position.x, plane.position.z);
      if (ground < 0.5) {
        this.crash('Ditched in the sea — the courier never made the strip.');
      } else {
        this.crash('You put her down in the rough, short of the runway.');
      }
      return;
    }
    // Wrong strip: a landing, but not the delivery. The plane survives
    // and the pilot can take off and try the right one.
    if (!onTargetRunway) {
      if (sink > CONFIG.landing.hardSink || tooFast || banked) {
        this.crash('Hard landing on the wrong strip.');
        return;
      }
      this.emit('wrong-runway', { runway: runway ? runway.name : '' });
      return;
    }
    // On the delivery strip: judge the touchdown.
    if (sink > CONFIG.landing.hardSink || tooFast || banked) {
      this.crash(
        tooFast
          ? 'Too fast on touchdown — the plane ran off the strip.'
          : banked
            ? 'You touched down banked and caught a wingtip.'
            : 'Hard landing — the undercarriage gave way.',
      );
      return;
    }
    if (sink > CONFIG.landing.maxSink) {
      this.damage += CONFIG.damage.hardLanding;
      this.emit('hard-landing', { damage: this.damage });
      if (this.damage >= CONFIG.damage.maxDamage) {
        this.crash('The airframe took too much punishment and broke up.');
        return;
      }
    } else if (sink < 3) {
      this.score += CONFIG.scoring.softLanding;
      this.softLandings += 1;
    }
    this.completeDelivery(plane, runway);
  }

  completeDelivery(plane, runway) {
    this.deliveriesMade += 1;
    this.score += CONFIG.scoring.delivery;
    this.fuel = CONFIG.fuel.capacity;
    this.emit('delivery', {
      delivery: this.deliveriesMade,
      score: this.score,
      runway: runway.name,
    });
    this.stageIndex += 1;
    if (this.stageIndex >= this.stages.length) {
      this.status = 'complete';
      this.score -= Math.floor(
        this.elapsedSeconds * CONFIG.scoring.timePenaltyPerSecond,
      );
      this.emit('complete', { score: this.score });
      return;
    }
    this.status = 'landed';
    this.activateCurrentStage();
  }

  // The pilot is rolling again after a delivery stop.
  resumeFlying() {
    if (this.status === 'landed') this.status = 'flying';
  }

  crash(reason) {
    this.status = 'crashed';
    this.crashReason = reason;
    this.emit('crash', { reason });
  }

  // Final score breakdown for the mission-complete screen.
  finalScoreLines() {
    const ringPoints = this.ringsPassed * CONFIG.scoring.ring;
    const deliveryPoints = this.deliveriesMade * CONFIG.scoring.delivery;
    const softPoints = this.softLandings * CONFIG.scoring.softLanding;
    const timePenalty = Math.floor(
      this.elapsedSeconds * CONFIG.scoring.timePenaltyPerSecond,
    );
    return [
      { label: 'Rings threaded', value: `${this.ringsPassed} × 100 = ${ringPoints}` },
      { label: 'Deliveries made', value: `${this.deliveriesMade} × 500 = ${deliveryPoints}` },
      { label: 'Soft-landing bonus', value: `${this.softLandings} × 50 = ${softPoints}` },
      { label: 'Time penalty', value: `− ${timePenalty}` },
      { label: 'Flight time', value: `${Math.floor(this.elapsedSeconds / 60)}:${String(Math.floor(this.elapsedSeconds % 60)).padStart(2, '0')}` },
      { label: 'FINAL SCORE', value: String(Math.max(0, this.score)) },
    ];
  }
}
