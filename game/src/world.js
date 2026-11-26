// Island Courier — the tropical archipelago.
//
// One analytic heightfield drives both the visible terrain mesh and the
// collision checks, so what the pilot sees is exactly what the plane can
// hit. Islands are smooth domes with a sandy rim, grassy slopes and rocky
// tops; two of them carry flattened strips with runways. The world also
// owns the gold delivery rings, the palm trees, the lighthouse, the clouds
// and the sun.

import THREE from './three-shim.js';
import { CONFIG } from './config.js';
import { createSeededRandom, randomRange, terrainWobble } from './random.js';

// Island definitions: centre, radius and peak height in metres.
const ISLANDS = [
  { name: 'Coral Bay', x: -350, z: -250, radius: 280, height: 58 },
  { name: 'Palm Island', x: 420, z: -380, radius: 210, height: 40 },
  { name: 'Lighthouse Rock', x: 150, z: 430, radius: 180, height: 72 },
  { name: 'Turtle Islet', x: 700, z: 300, radius: 115, height: 24 },
  { name: 'Frigate Islet', x: -760, z: 360, radius: 135, height: 28 },
  { name: 'North Sandbar', x: -40, z: -720, radius: 95, height: 15 },
  { name: 'South Sandbar', x: -180, z: 660, radius: 105, height: 17 },
];

// Runway definitions: centre, compass heading (radians, 0 = north),
// length, width and the flattened ground elevation under the strip.
const RUNWAYS = [
  {
    id: 'A',
    name: 'Coral Bay',
    x: -350,
    z: -250,
    heading: Math.PI / 2, // east-west strip
    length: 120,
    width: 16,
    elevation: 6,
  },
  {
    id: 'B',
    name: 'Palm Island',
    x: 420,
    z: -380,
    heading: 0.35,
    length: 95,
    width: 14,
    elevation: 5,
  },
];

// Ring positions per leg, in metres and altitude. Each ring faces the next
// point of its leg so the pilot always sees the hoop head-on.
const RING_LEGS = [
  // Leg 1: Coral Bay -> Palm Island (3 rings)
  [
    { x: -150, y: 48, z: -300 },
    { x: 80, y: 58, z: -350 },
    { x: 260, y: 48, z: -380 },
  ],
  // Leg 2: Palm Island -> Coral Bay (2 rings)
  [
    { x: 450, y: 62, z: -150 },
    { x: 250, y: 52, z: 150 },
  ],
  // Leg 3: the long way home around Lighthouse Rock (3 rings)
  [
    { x: -100, y: 58, z: 150 },
    { x: -260, y: 48, z: 40 },
    { x: -330, y: 42, z: -120 },
  ],
];

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// A small canvas texture for the sea: deep blue with lighter streaks and
// sparkle, tiled over the ocean plane.
function makeOceanTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e6f9e';
  ctx.fillRect(0, 0, 256, 256);
  const random = createSeededRandom(7);
  for (let i = 0; i < 260; i += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const length = 8 + random() * 26;
    ctx.strokeStyle =
      random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(10,60,100,0.16)';
    ctx.lineWidth = 1 + random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (random() - 0.5) * 4);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  return texture;
}

// Build one palm tree: a leaning trunk, six drooping fronds and coconuts.
// Geometries and materials are shared across all palms.
function buildPalmTree(materials, geometries, random) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(geometries.trunk, materials.trunk);
  trunk.position.y = 3.4;
  trunk.rotation.z = randomRange(random, -0.12, 0.12);
  trunk.rotation.x = randomRange(random, -0.08, 0.08);
  palm.add(trunk);
  const top = new THREE.Group();
  top.position.y = 6.9;
  top.position.x = trunk.rotation.z * -6.9;
  for (let i = 0; i < 6; i += 1) {
    const frond = new THREE.Mesh(geometries.frond, materials.frond);
    const angle = (i / 6) * Math.PI * 2 + randomRange(random, -0.2, 0.2);
    frond.position.set(Math.cos(angle) * 1.4, -0.2, Math.sin(angle) * 1.4);
    frond.rotation.y = -angle + Math.PI / 2;
    frond.rotation.z = 0.5;
    frond.scale.set(1, 1, randomRange(random, 0.85, 1.15));
    top.add(frond);
  }
  for (let i = 0; i < 3; i += 1) {
    const nut = new THREE.Mesh(geometries.nut, materials.nut);
    nut.position.set(
      randomRange(random, -0.4, 0.4),
      -0.5,
      randomRange(random, -0.4, 0.4),
    );
    top.add(nut);
  }
  palm.add(top);
  return palm;
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.random = createSeededRandom(seed);
    this.phaseA = this.random() * Math.PI * 2;
    this.phaseB = this.random() * Math.PI * 2;
    this.rings = [];
    this.clouds = [];
    this.beacon = null;
    this.elapsed = 0;
    this.buildSkyAndLights();
    this.buildOcean();
    this.buildTerrain();
    this.buildRunways();
    this.buildPalms();
    this.buildLighthouse();
    this.buildRings();
    this.buildClouds();
  }

  // Analytic ground height. Water is 0; islands rise as smooth domes
  // with a little seeded wobble; the ground flattens out under runways.
  terrainHeight(x, z) {
    let height = 0;
    for (const island of ISLANDS) {
      const dx = x - island.x;
      const dz = z - island.z;
      const distance = Math.sqrt(dx * dx + dz * dz) / island.radius;
      if (distance < 1) {
        const dome = 0.5 + 0.5 * Math.cos(distance * Math.PI);
        const wobble = 1 + terrainWobble(x, z, this.phaseA, this.phaseB) * 0.14;
        height += island.height * dome * wobble;
      }
    }
    // Flatten the ground into a clear approach corridor along each
    // runway: the strip itself plus a long, gentle funnel past both
    // thresholds, so a plane on final never meets a hillside short of
    // the runway. Off the corridor the island keeps its hills.
    for (const runway of RUNWAYS) {
      const dx = x - runway.x;
      const dz = z - runway.z;
      const along = dx * Math.sin(runway.heading) - dz * Math.cos(runway.heading);
      const across = dx * Math.cos(runway.heading) + dz * Math.sin(runway.heading);
      const beyondEnd = Math.max(0, Math.abs(along) - runway.length / 2);
      const beyondEdge = Math.max(0, Math.abs(across) - runway.width / 2);
      const corridorDistance = Math.sqrt(
        beyondEnd * beyondEnd + beyondEdge * beyondEdge,
      );
      const blend = 1 - smoothstep(60, 220, corridorDistance);
      if (blend > 0) {
        height = height * (1 - blend) + runway.elevation * blend;
      }
    }
    return Math.max(0, height);
  }

  buildSkyAndLights() {
    this.scene.background = new THREE.Color(CONFIG.colors.sky);
    this.scene.fog = new THREE.Fog(
      CONFIG.colors.fog,
      CONFIG.world.fogNear,
      CONFIG.world.fogFar,
    );
    const hemisphere = new THREE.HemisphereLight(0xbfe3ff, 0x3f7a4a, 0.6);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff2c8, 1.05);
    sun.position.set(500, 800, 300);
    this.scene.add(sun);
    // The visible sun disc, high in the east.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(60, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff6c9, fog: false }),
    );
    sunDisc.position.set(900, 620, -1000);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
  }

  buildOcean() {
    const geometry = new THREE.PlaneGeometry(5200, 5200);
    const material = new THREE.MeshPhongMaterial({
      map: makeOceanTexture(),
      color: 0x9fd0e8,
      shininess: 90,
      specular: 0x99ccff,
    });
    const ocean = new THREE.Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2;
    // Sit a hand's breadth above the flat seabed so the sea never
    // z-fights with the terrain mesh underneath it.
    ocean.position.y = CONFIG.world.oceanLevel + 0.35;
    this.scene.add(ocean);
  }

  buildTerrain() {
    const size = CONFIG.world.size;
    const segments = 170;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const sand = new THREE.Color(CONFIG.colors.sand);
    const grass = new THREE.Color(CONFIG.colors.grass);
    const grassDark = new THREE.Color(CONFIG.colors.grassDark);
    const rock = new THREE.Color(CONFIG.colors.rock);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const height = this.terrainHeight(x, z);
      positions.setY(i, height);
      const wobble = terrainWobble(x, z, this.phaseA, this.phaseB);
      if (height < 0.4) {
        color.copy(sand);
      } else if (height < 2.2) {
        color.copy(sand).lerp(grass, (height - 0.4) / 1.8);
      } else if (height < 16) {
        color.copy(grass).lerp(grassDark, Math.max(0, wobble) * 0.6);
      } else {
        color.copy(grassDark).lerp(rock, Math.min(1, (height - 16) / 22));
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.scene.add(terrain);
  }

  // A runway strip: dark asphalt, white centre dashes, threshold bars,
  // edge lights and a windsock, plus a delivery hut and fuel drums.
  buildRunwayStrip(runway) {
    const group = new THREE.Group();
    const asphalt = new THREE.Mesh(
      new THREE.BoxGeometry(runway.length, 0.5, runway.width),
      new THREE.MeshLambertMaterial({ color: CONFIG.colors.runway }),
    );
    asphalt.position.y = runway.elevation + 0.1;
    group.add(asphalt);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashCount = Math.floor(runway.length / 12);
    for (let i = 0; i < dashCount; i += 1) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.15, 0.7),
        dashMaterial,
      );
      dash.position.set(
        -runway.length / 2 + 6 + i * 12,
        runway.elevation + 0.42,
        0,
      );
      group.add(dash);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      for (let bar = -1; bar <= 1; bar += 1) {
        const threshold = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.15, 3),
          dashMaterial,
        );
        threshold.position.set(
          end * (runway.length / 2 - 4),
          runway.elevation + 0.42,
          bar * 4.5,
        );
        group.add(threshold);
      }
    }
    // Edge lights: small amber glowing spheres.
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (let i = 0; i <= 8; i += 1) {
      for (const side of [-1, 1]) {
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 8, 8),
          lightMaterial,
        );
        light.position.set(
          -runway.length / 2 + (i / 8) * runway.length,
          runway.elevation + 0.8,
          side * (runway.width / 2 + 1.5),
        );
        group.add(light);
      }
    }
    // Windsock on a pole beside the strip.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 8),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    );
    pole.position.set(runway.length / 2 - 8, runway.elevation + 3.5, 12);
    group.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2.6, 10),
      new THREE.MeshLambertMaterial({ color: 0xff7f2a }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(runway.length / 2 - 6.6, runway.elevation + 6.6, 12);
    group.add(sock);
    // Delivery hut and fuel drums at the apron.
    const hut = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4, 5),
      new THREE.MeshLambertMaterial({ color: 0xf2e3c2 }),
    );
    hut.position.set(-runway.length / 2 - 10, runway.elevation + 2, 14);
    group.add(hut);
    const hutRoof = new THREE.Mesh(
      new THREE.ConeGeometry(5.2, 2.4, 4),
      new THREE.MeshLambertMaterial({ color: 0xc65a3a }),
    );
    hutRoof.position.set(-runway.length / 2 - 10, runway.elevation + 5.2, 14);
    hutRoof.rotation.y = Math.PI / 4;
    group.add(hutRoof);
    const drumMaterial = new THREE.MeshLambertMaterial({ color: 0x2a6db0 });
    for (let i = 0; i < 3; i += 1) {
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.8, 12),
        drumMaterial,
      );
      drum.position.set(
        -runway.length / 2 - 4 + i * 2.2,
        runway.elevation + 0.9,
        16,
      );
      group.add(drum);
    }
    group.position.set(runway.x, 0, runway.z);
    group.rotation.y = -runway.heading;
    this.scene.add(group);
  }

  buildRunways() {
    for (const runway of RUNWAYS) {
      this.buildRunwayStrip(runway);
    }
  }

  buildPalms() {
    const materials = {
      trunk: new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
      frond: new THREE.MeshLambertMaterial({
        color: 0x2f8f3e,
        side: THREE.DoubleSide,
      }),
      nut: new THREE.MeshLambertMaterial({ color: 0x6b4a26 }),
    };
    const geometries = {
      trunk: new THREE.CylinderGeometry(0.28, 0.5, 7, 8),
      frond: new THREE.ConeGeometry(1.1, 4.4, 4),
      nut: new THREE.SphereGeometry(0.32, 8, 8),
    };
    geometries.frond.scale(1, 1, 0.28);
    let placed = 0;
    let attempts = 0;
    while (placed < 30 && attempts < 400) {
      attempts += 1;
      const x = randomRange(this.random, -1000, 1000);
      const z = randomRange(this.random, -900, 900);
      const height = this.terrainHeight(x, z);
      if (height < 2.5 || height > 9) continue;
      // Keep palms clear of the runways.
      let clear = true;
      for (const runway of RUNWAYS) {
        const dx = x - runway.x;
        const dz = z - runway.z;
        if (Math.sqrt(dx * dx + dz * dz) < 85) clear = false;
      }
      if (!clear) continue;
      const palm = buildPalmTree(materials, geometries, this.random);
      palm.position.set(x, height - 0.2, z);
      palm.rotation.y = this.random() * Math.PI * 2;
      const scale = randomRange(this.random, 0.85, 1.3);
      palm.scale.set(scale, scale, scale);
      this.scene.add(palm);
      placed += 1;
    }
  }

  buildLighthouse() {
    const island = ISLANDS[2];
    const baseHeight = this.terrainHeight(island.x, island.z);
    const group = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf5f2e8 });
    const red = new THREE.MeshLambertMaterial({ color: 0xd23b2e });
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.2, 16, 14),
      white,
    );
    tower.position.y = 8;
    group.add(tower);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(2.55, 2.8, 3, 14),
      red,
    );
    band.position.y = 9;
    group.add(band);
    const gallery = new THREE.Mesh(
      new THREE.CylinderGeometry(3.1, 3.1, 0.8, 14),
      new THREE.MeshLambertMaterial({ color: 0x333333 }),
    );
    gallery.position.y = 16.4;
    group.add(gallery);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
    );
    lamp.position.y = 18;
    group.add(lamp);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 2.4, 12),
      red,
    );
    roof.position.y = 20;
    group.add(roof);
    // Rotating beacon beam: a long translucent cone.
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(4, 90, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2a0,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(45, 18, 0);
    group.add(beam);
    this.beacon = beam;
    group.position.set(island.x, baseHeight - 0.5, island.z);
    this.scene.add(group);
  }

  buildRings() {
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.ringGold,
      emissive: 0xa66a00,
      emissiveIntensity: 0.7,
      metalness: 0.6,
      roughness: 0.35,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    let index = 0;
    for (let leg = 0; leg < RING_LEGS.length; leg += 1) {
      const legRings = RING_LEGS[leg];
      for (let i = 0; i < legRings.length; i += 1) {
        const spec = legRings[i];
        const group = new THREE.Group();
        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(9, 0.9, 12, 40),
          goldMaterial,
        );
        group.add(torus);
        const glow = new THREE.Mesh(
          new THREE.TorusGeometry(10.5, 1.6, 8, 40),
          glowMaterial,
        );
        group.add(glow);
        group.position.set(spec.x, spec.y, spec.z);
        // Face the next point of the leg (or the runway beyond it).
        const next =
          i + 1 < legRings.length
            ? legRings[i + 1]
            : leg === 0
              ? { x: RUNWAYS[1].x, y: 20, z: RUNWAYS[1].z }
              : { x: RUNWAYS[0].x, y: 20, z: RUNWAYS[0].z };
        group.lookAt(next.x, next.y, next.z);
        this.scene.add(group);
        this.rings.push({
          index,
          leg,
          group,
          torus,
          glow,
          center: new THREE.Vector3(spec.x, spec.y, spec.z),
          passed: false,
          active: false,
          pulsePhase: index * 1.3,
        });
        index += 1;
      }
    }
  }

  buildClouds() {
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    for (let i = 0; i < 14; i += 1) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(this.random() * 3);
      for (let p = 0; p < puffs; p += 1) {
        const radius = randomRange(this.random, 7, 15);
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 10, 8),
          material,
        );
        puff.position.set(
          randomRange(this.random, -16, 16),
          randomRange(this.random, -2, 3),
          randomRange(this.random, -8, 8),
        );
        puff.scale.y = 0.55;
        cloud.add(puff);
      }
      cloud.position.set(
        randomRange(this.random, -1100, 1100),
        randomRange(this.random, 110, 190),
        randomRange(this.random, -1000, 1000),
      );
      cloud.userData.drift = randomRange(this.random, 1.5, 3.5);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  // Per-frame life: clouds drift, rings breathe, the beacon sweeps.
  update(deltaTime) {
    this.elapsed += deltaTime;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * deltaTime;
      if (cloud.position.x > 1250) cloud.position.x = -1250;
    }
    for (const ring of this.rings) {
      if (ring.passed) continue;
      const pulse = 1 + Math.sin(this.elapsed * 2 + ring.pulsePhase) * 0.035;
      ring.group.scale.set(pulse, pulse, pulse);
      ring.glow.material.opacity =
        0.16 + Math.sin(this.elapsed * 2 + ring.pulsePhase) * 0.08;
    }
    if (this.beacon) {
      this.beacon.rotation.y += deltaTime * 0.7;
    }
  }

  // Helpers the missions and the HUD use.
  get runwayA() {
    return RUNWAYS[0];
  }

  get runwayB() {
    return RUNWAYS[1];
  }

  get ringList() {
    return this.rings;
  }
}
