// Island Courier — startup and the game loop.
//
// Builds the renderer, the world, the plane, the HUD and the mission
// manager, then runs the loop: read input, step the flight model and the
// missions, chase the plane with the camera, and refresh the glowing
// instruments. Game states: menu (title screen, camera orbiting the
// parked plane), playing, paused, crashed, complete, and frozen (the
// screenshot poses, which render but do not advance gameplay).

import THREE from './three-shim.js';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { buildCourierPlane, FlightModel } from './plane.js';
import { Hud } from './hud.js';
import { InputManager } from './input.js';
import { AudioEngine } from './audio.js';
import { MissionManager } from './missions.js';
import { parseShotQuery, applyShotState } from './shots.js';

const HOME_RUNWAY_START = { x: -350, z: -250 };

function buildRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  return renderer;
}

function startGame() {
  const shotQuery = parseShotQuery();
  const canvas = document.getElementById('scene');
  const renderer = buildRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.5,
    6000,
  );

  const world = new World(scene, shotQuery.seed);
  const { group: planeMesh, propeller, canopy, cockpitPanel } =
    buildCourierPlane();
  scene.add(planeMesh);
  const plane = new FlightModel(
    new THREE.Vector3(HOME_RUNWAY_START.x, world.runwayA.elevation + 1.45, HOME_RUNWAY_START.z),
    world.runwayA.heading,
  );
  plane.attachMesh(planeMesh, propeller);
  const hud = new Hud();
  const input = new InputManager(canvas);
  const audio = new AudioEngine();
  const missions = new MissionManager(world);

  const game = {
    plane,
    world,
    missions,
    hud,
    state: 'menu',
    frozen: false,
    shotMode: null,
    // 'chase' (default) or 'cockpit'; C / V toggles between them.
    viewMode: 'chase',
    // Metres the look target shifts left, so the plane reads right of
    // centre — used by the screenshot poses, where an overlay card covers
    // the middle of the frame.
    framingShift: 0,
    cameraYaw: 0,
    cameraPitch: 0,
  };

  // A read-only handle for debugging and automated smoke tests; it opens
  // nothing to the network and changes nothing about the game.
  window.__islandCourier = { plane, world, missions, hud, game, input, camera };

  // Chase camera: sit behind and above the plane, looking ahead down the
  // flight path. The camera follows heading and pitch but never the bank,
  // and the mouse can nudge it around the plane for a better look.
  function placeChaseCamera(yawOffset, pitchOffset, snap, distance, height, lookAhead) {
    const heading = plane.heading + yawOffset;
    const pitch = plane.pitch + pitchOffset;
    const cameraDistance = distance || CONFIG.camera.distance;
    const cameraHeight = height || CONFIG.camera.height;
    const cameraLookAhead =
      lookAhead === undefined ? CONFIG.camera.lookAhead : lookAhead;
    const cosPitch = Math.cos(pitch);
    const behind = new THREE.Vector3(
      -Math.sin(heading) * cosPitch,
      0,
      Math.cos(heading) * cosPitch,
    );
    const desired = new THREE.Vector3()
      .copy(plane.position)
      .addScaledVector(behind, cameraDistance);
    desired.y = plane.position.y + cameraHeight - Math.sin(pitch) * cameraDistance * 0.4;
    if (snap) {
      camera.position.copy(desired);
    } else {
      camera.position.lerp(desired, 0.35);
    }
    const lookTarget = new THREE.Vector3()
      .copy(plane.position)
      .addScaledVector(plane.forwardVector(), cameraLookAhead);
    // Shift the look target left of the plane so the plane itself reads
    // right of centre (framingShift is set by the screenshot poses).
    lookTarget.addScaledVector(
      new THREE.Vector3(Math.cos(plane.heading), 0, Math.sin(plane.heading)),
      -game.framingShift,
    );
    camera.lookAt(lookTarget);
  }
  game.placeChaseCamera = placeChaseCamera;

  function updateChaseCamera(deltaTime) {
    input.updateCameraOffset(deltaTime);
    const heading = plane.heading + input.cameraYawOffset;
    const pitch = plane.pitch + input.cameraPitchOffset;
    const distance = CONFIG.camera.distance;
    const height = CONFIG.camera.height;
    const cosPitch = Math.cos(pitch);
    const behind = new THREE.Vector3(
      -Math.sin(heading) * cosPitch,
      0,
      Math.cos(heading) * cosPitch,
    );
    const desired = new THREE.Vector3()
      .copy(plane.position)
      .addScaledVector(behind, distance);
    desired.y = plane.position.y + height - Math.sin(pitch) * distance * 0.4;
    const lerp = Math.min(1, CONFIG.camera.followLerp * deltaTime);
    camera.position.lerp(desired, lerp);
    const lookTarget = new THREE.Vector3()
      .copy(plane.position)
      .addScaledVector(plane.forwardVector(), CONFIG.camera.lookAhead);
    lookTarget.addScaledVector(
      new THREE.Vector3(Math.cos(plane.heading), 0, Math.sin(plane.heading)),
      -game.framingShift,
    );
    camera.lookAt(lookTarget);
  }

  // Cockpit camera: sit in the pilot's seat and look forward over the
  // nose. The camera rides the plane's heading, pitch and bank (like a
  // head fixed to the airframe), the mouse drag offsets turn the head to
  // look around, and the view rests a little below level so the nose and
  // the instrument panel read in the lower frame. The opaque canopy is
  // hidden in this view — the pilot looks through the windscreen, not at
  // the inside of the dome — and the wider field of view keeps the
  // wingtips reachable with a sideways glance.
  function updateCockpitCamera(deltaTime) {
    input.updateCameraOffset(deltaTime);
    const offset = new THREE.Vector3(
      CONFIG.camera.cockpit.offsetX,
      CONFIG.camera.cockpit.offsetY,
      CONFIG.camera.cockpit.offsetZ,
    ).applyEuler(plane.mesh.rotation);
    camera.position.copy(plane.position).add(offset);
    const euler = new THREE.Euler(
      plane.pitch + input.cameraPitchOffset - CONFIG.camera.cockpit.pitchDown,
      -(plane.heading + input.cameraYawOffset),
      -plane.bank,
      'YXZ',
    );
    camera.quaternion.setFromEuler(euler);
  }

  // Switch between the chase camera and the cockpit seat. The cockpit
  // opens the field of view and hides the canopy; switching back
  // restores both. Screenshot poses always use the chase camera.
  function setViewMode(mode, silent = false) {
    if (mode === game.viewMode) return;
    game.viewMode = mode;
    const cockpit = mode === 'cockpit';
    camera.fov = cockpit
      ? CONFIG.camera.cockpit.fov
      : CONFIG.camera.fov;
    camera.updateProjectionMatrix();
    if (canopy) canopy.visible = !cockpit;
    // The glareshield panel only exists in the cockpit: it pokes out of
    // the canopy, so it must stay hidden in the chase view.
    if (cockpitPanel) cockpitPanel.visible = cockpit;
    if (!silent) {
      hud.showMessage(
        cockpit ? 'COCKPIT VIEW — DRAG TO LOOK AROUND' : 'CHASE VIEW',
        1.6,
      );
    }
  }
  game.setViewMode = setViewMode;
  function computeTargetScreen() {
    const target = missions.currentTargetPosition();
    if (!target) return null;
    const projected = target.clone().project(camera);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const screenX = (projected.x * 0.5 + 0.5) * width;
    const screenY = (-projected.y * 0.5 + 0.5) * height;
    const onScreen =
      projected.z < 1 &&
      screenX > 40 &&
      screenX < width - 40 &&
      screenY > 40 &&
      screenY < height - 40;
    if (onScreen) return { visible: true };
    const dx = screenX - width / 2;
    const dy = screenY - height / 2;
    const angle = Math.atan2(dy, dx);
    const margin = 46;
    const edgeX = Math.max(
      margin,
      Math.min(width - margin, width / 2 + Math.cos(angle) * (width / 2 - margin)),
    );
    const edgeY = Math.max(
      margin,
      Math.min(height - margin, height / 2 + Math.sin(angle) * (height / 2 - margin)),
    );
    return {
      visible: false,
      angleDegrees: (angle * 180) / Math.PI + 90,
      edgeX,
      edgeY,
    };
  }

  function buildHudSnapshot() {
    return {
      altitudeFeet: plane.altitudeFeet,
      speedKnots: plane.speedKnots,
      verticalSpeedFpm: plane.verticalSpeedFpm,
      headingDegrees: plane.headingDegrees,
      targetBearingDegrees: missions.targetBearingDegrees(plane.position),
      pitchRadians: plane.pitch,
      bankRadians: plane.bank,
      throttle: plane.throttle,
      fuel: missions.fuel,
      damage: missions.damage,
      score: missions.score,
      elapsedSeconds: missions.elapsedSeconds,
      objective: missions.currentStage
        ? missions.currentStage.label
        : 'Sortie complete',
      distanceMetres: missions.distanceToTarget(plane.position),
      stalled: plane.stalled,
      targetScreen: computeTargetScreen(),
    };
  }

  // Mission events drive sound and flash messages.
  missions.onEvent = (type, data) => {
    if (type === 'ring') {
      audio.playRingChime();
      hud.showMessage(`RING +100  ·  ${data.ringsPassed} of 8`);
    } else if (type === 'delivery') {
      audio.playLandingThud(true);
      hud.showMessage(
        `DELIVERY ${data.delivery} OF 3  ·  +500  ·  REFUELLED`,
        3,
      );
    } else if (type === 'hard-landing') {
      audio.playLandingThud(false);
      hud.showMessage('HARD LANDING — AIRFRAME DAMAGE', 2.5);
    } else if (type === 'wrong-runway') {
      hud.showMessage('WRONG STRIP — THE DELIVERY IS ELSEWHERE', 2.5);
    } else if (type === 'fuel-empty') {
      hud.showMessage('FUEL EMPTY — GLIDE TO A STRIP', 3);
    } else if (type === 'crash') {
      audio.playCrashSound();
      audio.silenceFlightSound();
      game.state = 'crashed';
      hud.showScreen('crash', { reason: data.reason });
    } else if (type === 'complete') {
      audio.playClickBlip();
      game.state = 'complete';
      hud.showScreen('complete', { lines: missions.finalScoreLines() });
    }
  };

  function beginFlight() {
    audio.ensureAudioContext();
    audio.playClickBlip();
    missions.reset();
    // Every sortie starts in the chase view, whatever the last one used.
    setViewMode('chase', true);
    plane.reset(
      new THREE.Vector3(
        world.runwayA.x,
        world.runwayA.elevation + 1.45,
        world.runwayA.z,
      ),
      world.runwayA.heading,
    );
    camera.position.set(
      plane.position.x - Math.sin(plane.heading) * CONFIG.camera.distance,
      plane.position.y + CONFIG.camera.height + 2,
      plane.position.z + Math.cos(plane.heading) * CONFIG.camera.distance,
    );
    hud.showScreen(null);
    hud.showMessage('DELIVERY 1 — THREAD THE RINGS, THEN LAND', 3);
    game.state = 'playing';
  }

  function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    audio.silenceFlightSound();
    hud.showScreen('pause');
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    audio.ensureAudioContext();
    game.state = 'playing';
    hud.showScreen(null);
  }

  // Wire the buttons on the overlays and the keyboard shortcuts.
  document.getElementById('button-start').addEventListener('click', beginFlight);
  document.getElementById('button-resume').addEventListener('click', resumeGame);
  document.getElementById('button-restart-pause').addEventListener('click', beginFlight);
  document.getElementById('button-fly-again').addEventListener('click', beginFlight);
  document.getElementById('button-fly-again-complete').addEventListener('click', beginFlight);
  input.onPause = () => {
    if (game.state === 'playing') pauseGame();
    else if (game.state === 'paused') resumeGame();
  };
  input.onRestart = () => {
    if (game.state !== 'menu') beginFlight();
  };
  input.onMute = () => {
    audio.ensureAudioContext();
    const muted = audio.toggleMute();
    hud.showMessage(muted ? 'SOUND OFF' : 'SOUND ON', 1.2);
  };
  // C / V switches the seat: cockpit in live play only, never during a
  // frozen screenshot pose (the four shots always frame the chase view).
  input.onToggleCockpit = () => {
    if (game.state !== 'playing' || game.frozen || game.shotMode) return;
    setViewMode(game.viewMode === 'cockpit' ? 'chase' : 'cockpit');
  };
  input.onConfirm = () => {
    audio.ensureAudioContext();
    if (game.state === 'menu') beginFlight();
    else if (game.state === 'paused') resumeGame();
    else if (game.state === 'crashed' || game.state === 'complete') beginFlight();
  };
  input.onAnyKey = () => audio.ensureAudioContext();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Screenshot poses short-circuit normal play.
  if (shotQuery.shot) {
    game.shotMode = shotQuery.shot;
    const shotState = applyShotState(game, shotQuery.shot);
    if (shotState === 'frozen') {
      game.frozen = true;
      game.state = 'playing';
    } else {
      game.state = shotState;
    }
    // Keep the HUD lit in every shot.
    hud.update(buildHudSnapshot());
  } else {
    hud.showScreen('start');
    hud.update(buildHudSnapshot());
  }

  // Menu camera: a slow orbit around the parked plane.
  let menuAngle = 0.8;
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(clock.getDelta(), 0.05);
    world.update(deltaTime);

    if (game.state === 'menu') {
      // In the title screenshot the orbit holds still so the framing is
      // the same every capture; in normal play it drifts slowly.
      if (game.shotMode !== 'start') menuAngle += deltaTime * 0.12;
      const radius = 26;
      camera.position.set(
        plane.position.x + Math.sin(menuAngle) * radius,
        plane.position.y + 9,
        plane.position.z + Math.cos(menuAngle) * radius,
      );
      // Look slightly left of the plane so it reads right of centre,
      // clear of the title card.
      const forward = new THREE.Vector3()
        .subVectors(plane.position, camera.position)
        .normalize();
      const right = new THREE.Vector3()
        .crossVectors(forward, new THREE.Vector3(0, 1, 0))
        .normalize();
      const lookTarget = new THREE.Vector3(
        plane.position.x,
        plane.position.y + 1,
        plane.position.z,
      ).addScaledVector(right, -game.framingShift);
      camera.lookAt(lookTarget);
      plane.propellerAngle += deltaTime * 0.6;
      plane.syncMesh();
    } else if (game.state === 'playing' && !game.frozen) {
      const controls = input.readFlightControls();
      plane.update(deltaTime, controls, (x, z) => world.terrainHeight(x, z));
      missions.update(deltaTime, plane);
      if (missions.status === 'landed' && !plane.grounded) {
        missions.resumeFlying();
      }
      audio.setFlightSound(plane.throttle, plane.speedKnots);
      if (game.viewMode === 'cockpit') {
        updateCockpitCamera(deltaTime);
      } else {
        updateChaseCamera(deltaTime);
      }
    } else if (game.frozen) {
      // Screenshot pose: the world lives (propeller, clouds, rings) but
      // the plane holds its pose and no input is read.
      plane.propellerAngle += deltaTime * 20;
      plane.syncMesh();
      updateChaseCamera(deltaTime);
    }
    // Crashed and complete states keep rendering the scene behind the
    // overlay; the camera holds where it was.

    hud.update(buildHudSnapshot());
    renderer.render(scene, camera);
  }

  animate();
}

startGame();
