const hudCanvas = document.getElementById("hudCanvas");
const menuEl = document.getElementById("menu");
const overlayEl = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const dailyBtn = document.getElementById("dailyBtn");
const rewardBox = document.getElementById("rewardBox");
const modeLabel = document.getElementById("modeLabel");
const statusLabel = document.getElementById("statusLabel");
const speedReadout = document.getElementById("speedReadout");
const coinReadout = document.getElementById("coinReadout");
const rankReadout = document.getElementById("rankReadout");
const toastEl = document.getElementById("toast");
const endPanel = document.getElementById("endPanel");
const endTitle = document.getElementById("endTitle");
const endText = document.getElementById("endText");
const replayBtn = document.getElementById("replayBtn");
const restartBtn = document.getElementById("restartBtn");
const touchBtns = [...document.querySelectorAll("[data-touch]")];
const modeCards = [...document.querySelectorAll(".modeCard")];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1020, 70, 320);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 18, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: hudCanvas, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ambient = new THREE.AmbientLight(0xbfd8ff, 1.3);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(35, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x8ecbff, 0x1a1d29, 1.15);
scene.add(hemi);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: 0x20351f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const skyGlow = new THREE.Mesh(
  new THREE.SphereGeometry(350, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0x101a32, side: THREE.BackSide })
);
scene.add(skyGlow);

const state = {
  mode: "normal",
  running: false,
  raceFinished: false,
  lap: 1,
  totalLaps: 3,
  coins: 0,
  rank: 4,
  speed: 0,
  boostEnergy: 100,
  boostActive: 0,
  keys: new Set(),
  touch: new Set(),
  lastTime: performance.now(),
  trackProgress: 0,
  bestProgress: 0,
  checkpoint: 0,
  nextCheckpoint: 0,
  lapStartTime: 0,
  lapTimes: [],
  lastLapGhost: [],
  replay: false,
  replayTime: 0,
  dailyClaimDate: null,
  offTrack: false,
  introShown: false,
};

const track = createTrack();
const world = {
  trackRadiusX: 56,
  trackRadiusZ: 32,
  roadWidth: 10,
  checkpoints: track.checkpoints,
  centerPoints: track.centerPoints,
  boostPads: [],
  coins: [],
  obstacles: [],
  ai: [],
};

const kart = createKart(0x79b7ff);
kart.group.position.set(track.startPos.x, 0.7, track.startPos.z);
scene.add(kart.group);

const aiKart = createKart(0xff8a6a);
aiKart.group.position.set(track.startPos.x - 2.6, 0.7, track.startPos.z - 3.5);
scene.add(aiKart.group);

world.ai.push({
  kart: aiKart,
  speed: 0,
  targetIndex: 8,
  lap: 1,
  nextCheckpoint: 0,
  progress: 0,
  finished: false
});

const decorations = createDecorations();
scene.add(decorations);

spawnRaceObjects();

const clock = new THREE.Clock();

function createTrack() {
  const centerPoints = [];
  const checkpoints = [];
  const segments = 220;
  const rx = 56;
  const rz = 32;
  const wobble = 0.08;

  const outer = [];
  const inner = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const modulation = 1 + Math.sin(t * 3) * wobble + Math.sin(t * 5.5) * wobble * 0.35;
    const cx = Math.cos(t) * rx * modulation;
    const cz = Math.sin(t) * rz * modulation;
    centerPoints.push(new THREE.Vector3(cx, 0.02, cz));

    const nx = Math.cos(t);
    const nz = Math.sin(t);
    const tangent = new THREE.Vector3(-Math.sin(t), 0, Math.cos(t)).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();

    const width = 5.4 + Math.sin(t * 4.0) * 0.7;
    outer.push(new THREE.Vector2(cx + normal.x * width, cz + normal.z * width));
    inner.push(new THREE.Vector2(cx - normal.x * width, cz - normal.z * width));

    if (i % 44 === 0) {
      checkpoints.push({ index: i, pos: new THREE.Vector3(cx, 0.12, cz), passed: false });
    }
  }

  const shape = new THREE.Shape();
  outer.forEach((p, i) => i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y));
  shape.closePath();

  const hole = new THREE.Path();
  inner.slice().reverse().forEach((p, i) => i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y));
  hole.closePath();
  shape.holes.push(hole);

  const road = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 1, metalness: 0.02 })
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  const curbOuter = makeLineRing(centerPoints, 62.5, 0xebeefc, 0.18);
  const curbInner = makeLineRing(centerPoints, 50.7, 0xff5555, 0.18);
  scene.add(curbOuter, curbInner);

  const startPos = centerPoints[0].clone();
  startPos.y = 0.15;

  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 1.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7cb9ff, emissiveIntensity: 0.6 })
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(startPos.x, 0.03, startPos.z);
  scene.add(startLine);

  return { centerPoints, checkpoints, startPos };
}

function makeLineRing(points, radius, color, height) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    const dir = next.clone().sub(p);
    const len = dir.length();
    const angle = Math.atan2(dir.z, dir.x);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.38), material);
    bar.position.set((p.x + next.x) / 2, height / 2 + 0.02, (p.z + next.z) / 2);
    bar.rotation.y = -angle;
    bar.castShadow = true;
    group.add(bar);
  });
  return group;
}

function createKart(color) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.45, 2.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.12 })
  );
  body.castShadow = true;
  body.position.y = 0.55;
  group.add(body);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.5, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1a1f27, roughness: 0.9 })
  );
  seat.position.set(0, 0.85, -0.1);
  seat.castShadow = true;
  group.add(seat);

  const nose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.3, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 0.4 })
  );
  nose.rotation.z = Math.PI / 2;
  nose.position.set(0, 0.35, 1.2);
  nose.castShadow = true;
  group.add(nose);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 1 });
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14);
  const wheelPos = [
    [-0.85, 0.2,  0.9],
    [ 0.85, 0.2,  0.9],
    [-0.85, 0.2, -0.9],
    [ 0.85, 0.2, -0.9],
  ];
  wheelPos.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  });

  const driver = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xf0c29c, roughness: 0.75 })
  );
  driver.position.set(0, 1.1, -0.15);
  driver.castShadow = true;
  group.add(driver);

  return {
    group,
    velocity: new THREE.Vector3(),
    angle: Math.PI / 2,
    steer: 0,
    drift: 0,
    color,
  };
}

function createDecorations() {
  const group = new THREE.Group();
  const trees = [];
  for (let i = 0; i < 110; i++) {
    const angle = (i / 110) * Math.PI * 2;
    const dist = 80 + (i % 5) * 4 + (i % 3) * 7;
    const x = Math.cos(angle) * dist + Math.sin(i) * 2.5;
    const z = Math.sin(angle) * dist + Math.cos(i * 0.5) * 2.5;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x7a4a28, roughness: 1 })
    );
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(1.7 + (i % 3) * 0.22, 10, 10),
      new THREE.MeshStandardMaterial({ color: i % 4 === 0 ? 0x2f7634 : 0x3f8a3b, roughness: 1 })
    );
    crown.position.y = 3.35;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    group.add(tree);
    trees.push(tree);
  }

  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 1.6, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1b2442, emissive: 0x10203a, emissiveIntensity: 0.35 })
  );
  banner.position.set(track.startPos.x + 2.2, 4.2, track.startPos.z - 4.8);
  banner.rotation.y = Math.PI / 2;
  banner.castShadow = true;
  group.add(banner);

  return group;
}

function spawnRaceObjects() {
  world.boostPads = [];
  world.coins = [];
  world.obstacles = [];
  world.ai[0].targetIndex = 8;
  world.ai[0].lap = 1;
  world.ai[0].progress = 0;

  if (state.mode === "arcade") {
    for (let i = 16; i < track.centerPoints.length; i += 44) {
      const p = track.centerPoints[i];
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.12, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x65ecff, emissive: 0x2adfff, emissiveIntensity: 0.8 })
      );
      pad.position.set(p.x, 0.065, p.z);
      pad.rotation.y = Math.atan2(
        track.centerPoints[(i + 1) % track.centerPoints.length].z - p.z,
        track.centerPoints[(i + 1) % track.centerPoints.length].x - p.x
      );
      pad.receiveShadow = true;
      scene.add(pad);
      world.boostPads.push(pad);
    }

    for (let i = 30; i < track.centerPoints.length; i += 55) {
      const p = track.centerPoints[i];
      const coin = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.14, 12, 18),
        new THREE.MeshStandardMaterial({ color: 0xffd95a, emissive: 0x8f5f00, emissiveIntensity: 0.35 })
      );
      coin.position.set(p.x, 1.0, p.z);
      coin.rotation.x = Math.PI / 2;
      coin.castShadow = true;
      scene.add(coin);
      world.coins.push({ mesh: coin, collected: false, pulse: Math.random() * Math.PI * 2 });
    }
  }
}

function setMode(mode) {
  state.mode = mode;
  modeCards.forEach(card => card.classList.toggle("selected", card.dataset.mode === mode));
}

modeCards.forEach(card => {
  card.addEventListener("click", () => setMode(card.dataset.mode));
});

function startRace() {
  state.running = true;
  state.raceFinished = false;
  state.replay = false;
  state.lap = 1;
  state.coins = 0;
  state.speed = 0;
  state.boostEnergy = 100;
  state.boostActive = 0;
  state.trackProgress = 0;
  state.bestProgress = 0;
  state.checkpoint = 0;
  state.nextCheckpoint = 0;
  state.lapTimes = [];
  state.lastLapGhost = [];
  state.offTrack = false;
  state.lapStartTime = performance.now();

  kart.group.position.copy(track.startPos);
  kart.group.position.y = 0.7;
  kart.angle = Math.PI / 2;
  kart.velocity.set(0, 0, 0);

  aiKart.group.position.set(track.startPos.x - 2.6, 0.7, track.startPos.z - 3.5);
  aiKart.angle = Math.PI / 2;
  aiKart.velocity.set(0, 0, 0);

  spawnRaceObjects();
  menuEl.classList.add("hidden");
  overlayEl.classList.remove("hidden");
  endPanel.classList.add("hidden");
  showToast(`Starting ${state.mode.toUpperCase()} mode`);

  if (!state.introShown) {
    state.introShown = true;
    setTimeout(() => showToast("WASD / Arrows to drive. Space = boost in Arcade mode."), 600);
  }
}

function showToast(text, ms = 2200) {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getInput() {
  const keys = state.keys;
  const touch = state.touch;
  return {
    left: keys.has("ArrowLeft") || keys.has("KeyA") || touch.has("left"),
    right: keys.has("ArrowRight") || keys.has("KeyD") || touch.has("right"),
    throttle: keys.has("ArrowUp") || keys.has("KeyW") || touch.has("throttle"),
    brake: keys.has("ArrowDown") || keys.has("KeyS") || touch.has("brake"),
    boost: keys.has("Space") || touch.has("boost"),
  };
}

function driveKart(entity, dt, isPlayer = false) {
  const input = isPlayer ? getInput() : aiInput(entity, dt);
  const pos = entity.group.position;
  const mode = state.mode;
  const speed = entity.velocity.length();

  const nearest = nearestTrackPoint(pos);
  const dist = nearest.distance;
  const inTrack = dist < 6.0;

  let maxSpeed = mode === "arcade" ? 28 : 23;
  let accel = mode === "arcade" ? 18 : 15;
  let grip = mode === "arcade" ? 5.4 : 7.2;
  let brakePower = mode === "arcade" ? 24 : 22;

  if (!inTrack) {
    accel *= 0.55;
    grip *= 0.42;
    maxSpeed *= 0.78;
    state.offTrack = true;
  } else {
    state.offTrack = false;
  }

  if (input.boost && state.mode === "arcade" && state.boostEnergy > 1 && isPlayer) {
    state.boostActive = Math.min(1.2, state.boostActive + dt * 2.8);
    state.boostEnergy -= dt * 20;
  }

  if (!input.boost && state.boostActive > 0) {
    state.boostActive = Math.max(0, state.boostActive - dt * 1.8);
  }

  const boostMult = 1 + state.boostActive * 0.75;
  maxSpeed *= boostMult;
  accel *= boostMult;

  const forward = new THREE.Vector3(Math.cos(entity.angle), 0, Math.sin(entity.angle));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);

  let steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steeringAtSpeed = 1 / (1 + speed * 0.07);
  entity.steer += (steerInput - entity.steer) * clamp(dt * 10, 0, 1);

  if (input.throttle) {
    entity.velocity.addScaledVector(forward, accel * dt);
  }
  if (input.brake) {
    entity.velocity.addScaledVector(forward, -brakePower * dt);
  }

  entity.velocity.addScaledVector(entity.velocity.clone().multiplyScalar(-1), 0); // no-op to keep vector fresh

  const sideSpeed = entity.velocity.dot(right);
  const forwardSpeed = entity.velocity.dot(forward);

  // Friction and grip.
  entity.velocity.addScaledVector(entity.velocity, -dt * (inTrack ? 0.42 : 1.05));
  entity.velocity.addScaledVector(right, -sideSpeed * grip * dt);
  entity.velocity.addScaledVector(forward, -Math.max(0, forwardSpeed - maxSpeed) * dt * 0.65);

  // Rotate kart.
  const turnRate = (entity === kart ? 2.3 : 1.85) * steeringAtSpeed * (0.6 + Math.min(speed / 12, 1.1));
  entity.angle += steerInput * turnRate * dt * (input.brake ? 0.65 : 1);

  if (entity === kart && state.mode === "arcade" && input.boost && state.boostEnergy > 0) {
    entity.velocity.addScaledVector(forward, 14 * dt);
  }

  // Move.
  pos.addScaledVector(entity.velocity, dt);
  pos.y = 0.7;

  // Visual rotation.
  entity.group.rotation.y = -entity.angle + Math.PI / 2;

  // Wheel spin-ish tilt.
  entity.group.children.forEach(child => {
    if (child.geometry && child.geometry.type === "CylinderGeometry") {
      child.rotation.y += speed * dt * 2;
    }
  });

  return {
    inTrack,
    speed: entity.velocity.length()
  };
}

function aiInput(ai, dt) {
  const look = track.centerPoints[ai.targetIndex];
  const pos = ai.kart.group.position;
  const desired = new THREE.Vector3(look.x, 0, look.z).sub(pos);
  const angleToTarget = Math.atan2(desired.z, desired.x);
  let delta = normalizeAngle(angleToTarget - ai.kart.angle);

  if (desired.length() < 5.0) {
    ai.targetIndex = (ai.targetIndex + 1) % track.centerPoints.length;
    if (ai.targetIndex % 44 === 0) ai.lap = ai.lap; // no-op, helper for pacing
  }

  const throttle = true;
  const brake = Math.abs(delta) > 0.95 && ai.kart.velocity.length() > 14;
  return {
    left: delta > 0.12,
    right: delta < -0.12,
    throttle,
    brake,
    boost: false,
  };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function nearestTrackPoint(pos) {
  let best = null;
  for (let i = 0; i < track.centerPoints.length; i++) {
    const p = track.centerPoints[i];
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!best || d < best.distance) {
      best = { index: i, point: p, distance: d };
    }
  }
  return best;
}

function updateProgress() {
  const nearest = nearestTrackPoint(kart.group.position);
  state.trackProgress = nearest.index;

  const startWindow = nearest.index < 6 || nearest.index > track.centerPoints.length - 6;
  const currentlyOnStartSide = startWindow && nearest.distance < 7.0;

  if (state.bestProgress === 0 && nearest.index > 15) state.bestProgress = nearest.index;

  if (state.checkpoint === 0 && currentlyOnStartSide && state.bestProgress > 10) {
    state.checkpoint = 1;
  }

  if (state.checkpoint === 1 && nearest.index > 44 && nearest.index < 60) {
    state.checkpoint = 2;
  }
  if (state.checkpoint === 2 && nearest.index > 88 && nearest.index < 104) {
    state.checkpoint = 3;
  }
  if (state.checkpoint === 3 && nearest.index > 132 && nearest.index < 148) {
    state.checkpoint = 4;
  }

  const crossedFinish = state.checkpoint >= 4 && currentlyOnStartSide && state.bestProgress > 170;
  if (crossedFinish) {
    const now = performance.now();
    const lapTime = (now - state.lapStartTime) / 1000;
    state.lapTimes.push(lapTime);
    state.lapStartTime = now;
    state.checkpoint = 0;
    state.bestProgress = 0;
    state.lap += 1;
    if (state.mode === "arcade") {
      state.coins += 10;
      showToast(`Lap complete! +10 coins`);
    } else {
      showToast(`Lap complete in ${lapTime.toFixed(2)}s`);
    }
    if (state.lap > state.totalLaps) {
      finishRace();
    }
  }
}

function updateCoinsAndBoosts(dt) {
  world.coins.forEach(c => {
    if (c.collected) return;
    c.pulse += dt * 3;
    c.mesh.position.y = 1.0 + Math.sin(c.pulse) * 0.15;
    c.mesh.rotation.z += dt * 2;
    const d = c.mesh.position.distanceTo(kart.group.position);
    if (d < 1.2) {
      c.collected = true;
      c.mesh.visible = false;
      state.coins += 1;
      if (state.mode === "arcade") {
        state.boostEnergy = clamp(state.boostEnergy + 18, 0, 100);
      }
      showToast("Coin collected!");
    }
  });

  world.boostPads.forEach(pad => {
    if (pad.position.distanceTo(kart.group.position) < 1.9) {
      state.boostEnergy = clamp(state.boostEnergy + dt * 22, 0, 100);
      if (state.mode === "arcade" && !state.replay) {
        kart.velocity.add(new THREE.Vector3(Math.cos(kart.angle), 0, Math.sin(kart.angle)).multiplyScalar(10 * dt));
      }
    }
  });
}

function updateAI(dt) {
  const ai = world.ai[0];
  const ctrl = aiInput(ai, dt);
  const entity = ai.kart;
  const pos = entity.group.position;
  const forward = new THREE.Vector3(Math.cos(entity.angle), 0, Math.sin(entity.angle));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);

  const accel = 14;
  const maxSpeed = 22.5;
  if (ctrl.throttle) entity.velocity.addScaledVector(forward, accel * dt);
  if (ctrl.brake) entity.velocity.addScaledVector(forward, -18 * dt);
  entity.velocity.addScaledVector(entity.velocity.clone(), -dt * 0.48);
  entity.velocity.addScaledVector(right, -entity.velocity.dot(right) * 5.5 * dt);
  entity.velocity.addScaledVector(forward, -Math.max(0, entity.velocity.dot(forward) - maxSpeed) * 0.7 * dt);

  const steer = (ctrl.left ? 1 : 0) - (ctrl.right ? 1 : 0);
  entity.angle += steer * 2.0 * dt;
  pos.addScaledVector(entity.velocity, dt);
  pos.y = 0.7;
  entity.group.rotation.y = -entity.angle + Math.PI / 2;
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.cos(kart.angle), 0, Math.sin(kart.angle));
  const targetPos = kart.group.position.clone()
    .addScaledVector(forward, -7.8)
    .add(new THREE.Vector3(0, 6.2, 0));
  camera.position.lerp(targetPos, 1 - Math.pow(0.001, dt));
  camera.lookAt(kart.group.position.x, kart.group.position.y + 1.0, kart.group.position.z);
}

function updateUI() {
  speedReadout.textContent = Math.round(state.speed * 3.6);
  coinReadout.textContent = state.coins;
  rankReadout.textContent = rankText(state.rank);
  modeLabel.textContent = state.mode.toUpperCase();
  statusLabel.textContent = `Lap ${Math.min(state.lap, state.totalLaps)}/${state.totalLaps}`;
}

function rankText(rank) {
  return ["1", "2", "3", "4"].includes(String(rank)) ? rank : "4";
}

function finishRace() {
  state.running = false;
  state.raceFinished = true;
  endPanel.classList.remove("hidden");

  const totalTime = state.lapTimes.reduce((a, b) => a + b, 0);
  const finishCoins = state.coins;
  const summary = `You finished ${state.totalLaps} laps in ${totalTime.toFixed(2)}s and earned ${finishCoins} coins.`;

  endTitle.textContent = "Race Complete";
  endText.textContent = summary;
  state.lastLapGhost = captureGhost();
  saveDailyReward(finishCoins);
}

function captureGhost() {
  // lightweight placeholder ghost data
  return [{
    x: kart.group.position.x,
    z: kart.group.position.z,
    angle: kart.angle,
    mode: state.mode
  }];
}

function saveDailyReward(coinsEarned) {
  const today = new Date().toISOString().slice(0, 10);
  const key = "goKartDailyReward";
  const record = JSON.parse(localStorage.getItem(key) || "{}");
  record.last = today;
  record.streak = record.last === today ? (record.streak || 0) : 1;
  record.totalCoins = (record.totalCoins || 0) + Math.max(1, Math.floor(coinsEarned / 3));
  localStorage.setItem(key, JSON.stringify(record));
}

function claimDaily() {
  const today = new Date().toISOString().slice(0, 10);
  const key = "goKartDailyReward";
  const record = JSON.parse(localStorage.getItem(key) || "{}");
  if (record.last === today) {
    rewardBox.classList.remove("hidden");
    rewardBox.textContent = `Daily reward already claimed today. Come back tomorrow for more coins.`;
    return;
  }
  const amount = 50;
  record.last = today;
  record.streak = (record.streak || 0) + 1;
  record.totalCoins = (record.totalCoins || 0) + amount;
  localStorage.setItem(key, JSON.stringify(record));
  rewardBox.classList.remove("hidden");
  rewardBox.textContent = `Daily reward claimed: +${amount} coins. Streak: ${record.streak}.`;
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0.016);
  state.lastTime = now;

  if (state.running) {
    const player = driveKart(kart, dt, true);
    state.speed = player.speed;
    updateAI(dt);
    updateProgress();
    updateCoinsAndBoosts(dt);
    updateCamera(dt);
    updateUI();

    if (state.boostEnergy <= 0 && state.mode === "arcade") {
      state.boostEnergy = Math.max(0, state.boostEnergy + dt * 10);
    }
  } else {
    // subtle idle motion
    kart.group.rotation.y += dt * 0.2;
    aiKart.group.rotation.y += dt * 0.14;
  }

  world.coins.forEach(c => {
    if (!c.collected) c.mesh.rotation.y += dt * 1.5;
  });

  renderer.render(scene, camera);
}

function loadDailyState() {
  const record = JSON.parse(localStorage.getItem("goKartDailyReward") || "{}");
  if (record.last) {
    rewardBox.classList.remove("hidden");
    rewardBox.textContent = `Saved coins: ${record.totalCoins || 0}. Daily streak: ${record.streak || 0}.`;
  }
}

function setupControls() {
  window.addEventListener("keydown", e => {
    state.keys.add(e.code);
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyW","KeyA","KeyS","KeyD"].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === "Enter" && menuEl.classList.contains("hidden")) {
      if (!state.running) startRace();
    }
  });

  window.addEventListener("keyup", e => state.keys.delete(e.code));
  window.addEventListener("blur", () => state.keys.clear());

  touchBtns.forEach(btn => {
    const name = btn.dataset.touch;
    const down = () => state.touch.add(name);
    const up = () => state.touch.delete(name);
    btn.addEventListener("pointerdown", e => { e.preventDefault(); down(); });
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
  });
}

dailyBtn.addEventListener("click", claimDaily);
startBtn.addEventListener("click", startRace);
restartBtn.addEventListener("click", startRace);
replayBtn.addEventListener("click", () => {
  if (!state.lastLapGhost.length) {
    showToast("No replay yet — finish a race first.");
    return;
  }
  showToast("Replay mode is scaffolded for the next update.");
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

setupControls();
loadDailyState();
setMode("normal");
requestAnimationFrame(loop);
showToast("Pick a mode, then start racing.");
