// Island Courier — deterministic screenshot states.
//
// The game reads ?shot=start|play|ring|end&seed=N. Each state poses the
// plane, the camera, the mission and the HUD so the frame is ready to
// capture the moment the page opens: the title screen over the parked
// plane, a mid-flight chase with a ring ahead, the instant after threading
// a ring, and the mission-complete screen on the home strip. The seed
// rebuilds the same archipelago every time, so the four shots always show
// the same world.

import THREE from './three-shim.js';

// Parse the query string. Unknown values fall back to normal play.
export function parseShotQuery() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number.parseInt(params.get('seed') || '1', 10);
  return {
    shot: ['start', 'play', 'ring', 'end'].includes(shot) ? shot : null,
    seed: Number.isFinite(seed) ? seed : 1,
  };
}

// Place the plane on the home runway, nose down the strip, engines off.
function parkOnHomeRunway(game) {
  const runway = game.world.runwayA;
  const plane = game.plane;
  plane.reset(
    new THREE.Vector3(runway.x, runway.elevation + 1.45, runway.z),
    runway.heading,
  );
  plane.throttle = 0;
  plane.speed = 0;
}

// Put the plane in the air on the first leg, chasing the second ring.
function poseMidFlight(game) {
  const plane = game.plane;
  const rings = game.world.ringList;
  const firstRing = rings[0];
  const secondRing = rings[1];
  // Mark the first ring as threaded so the HUD reads "ring 2 of 8".
  firstRing.passed = true;
  firstRing.group.visible = false;
  game.missions.ringsPassed = 1;
  game.missions.score = 100;
  game.missions.stageIndex = 1;
  game.missions.elapsedSeconds = 47;
  game.missions.activateCurrentStage();
  // Park the plane 120 m short of the live ring, at its altitude, aimed
  // straight at it.
  const direction = new THREE.Vector3()
    .subVectors(secondRing.center, firstRing.center)
    .normalize();
  const position = new THREE.Vector3()
    .copy(secondRing.center)
    .addScaledVector(direction, -120);
  const heading = Math.atan2(direction.x, -direction.z);
  plane.reset(position, heading);
  plane.grounded = false;
  plane.throttle = 0.68;
  plane.speed = 42;
  plane.pitch = 0.02;
  plane.bank = 0.08;
  plane.syncMesh();
  game.missions.fuel = 82;
}

// The instant after threading a ring: the hoop is just behind the plane,
// the score has ticked up and the flash message is showing.
function poseJustAfterRing(game) {
  poseMidFlight(game);
  const plane = game.plane;
  const secondRing = game.world.ringList[1];
  const thirdRing = game.world.ringList[2];
  secondRing.passed = true;
  secondRing.group.visible = false;
  game.missions.ringsPassed = 2;
  game.missions.score = 200;
  game.missions.stageIndex = 2;
  game.missions.elapsedSeconds = 61;
  game.missions.activateCurrentStage();
  const direction = new THREE.Vector3()
    .subVectors(thirdRing.center, secondRing.center)
    .normalize();
  const position = new THREE.Vector3()
    .copy(secondRing.center)
    .addScaledVector(direction, 16);
  const heading = Math.atan2(direction.x, -direction.z);
  plane.reset(position, heading);
  plane.grounded = false;
  plane.throttle = 0.72;
  plane.speed = 45;
  plane.pitch = 0.02;
  plane.bank = -0.05;
  plane.syncMesh();
  game.missions.fuel = 78;
  game.hud.showMessage('RING +100', 3);
}

// Pose the game for a screenshot. `game` carries plane, world, missions,
// hud, camera and the chase-camera helper from main.js. Returns the game
// state the main loop should hold ('menu', 'frozen' or 'complete').
export function applyShotState(game, shot) {
  if (shot === 'start') {
    parkOnHomeRunway(game);
    game.missions.reset();
    // Title card sits on the left; shift the plane right in the frame.
    game.framingShift = 11;
    game.hud.showScreen('start');
    game.placeChaseCamera(0.6, 0.25);
    return 'menu';
  }
  if (shot === 'play') {
    poseMidFlight(game);
    game.missions.status = 'flying';
    game.hud.showScreen(null);
    game.placeChaseCamera(0, 0);
    return 'frozen';
  }
  if (shot === 'ring') {
    poseJustAfterRing(game);
    game.missions.status = 'flying';
    game.hud.showScreen(null);
    game.placeChaseCamera(0, 0);
    return 'frozen';
  }
  // end: all three deliveries done, parked on the home strip, final score.
  parkOnHomeRunway(game);
  game.missions.reset();
  game.missions.ringsPassed = 8;
  game.missions.deliveriesMade = 3;
  game.missions.softLandings = 2;
  game.missions.elapsedSeconds = 214;
  game.missions.score =
    8 * 100 + 3 * 500 + 2 * 50 - Math.floor(214 * 1.5);
  game.missions.status = 'complete';
  game.missions.stageIndex = game.missions.stages.length;
  // The score card covers the middle; pull the camera back and shift the
  // plane right in frame so the parked courier reads beside the card.
  game.framingShift = 4;
  game.hud.showScreen('complete', {
    lines: game.missions.finalScoreLines(),
  });
  game.placeChaseCamera(0.45, 0.1, true, 24, 7, 2);
  return 'complete';
}
