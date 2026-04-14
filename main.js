import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const canvas = document.getElementById("scene");
const scoreLabel = document.getElementById("score");
const speedLabel = document.getElementById("speed");
const hudHint = document.querySelector(".hint");
const mobileControls = document.getElementById("mobileControls");
const lookPad = document.getElementById("lookPad");
const moveStick = document.getElementById("moveStick");
const moveKnob = document.getElementById("moveKnob");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d1118, 0.0018);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 30, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;

const hemi = new THREE.HemisphereLight(0x79a4d6, 0x101015, 0.33);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffefcc, 1.15);
sun.position.set(150, 240, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 900;
sun.shadow.camera.left = -320;
sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320;
sun.shadow.camera.bottom = -320;
scene.add(sun);

const ambientRim = new THREE.DirectionalLight(0x74b7ff, 0.48);
ambientRim.position.set(-110, 90, -120);
scene.add(ambientRim);

const skyGeo = new THREE.SphereGeometry(2800, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x19365e) },
    horizonColor: { value: new THREE.Color(0x5679a3) },
    bottomColor: { value: new THREE.Color(0x0a0f16) }
  },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorld = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    uniform vec3 topColor;
    uniform vec3 horizonColor;
    uniform vec3 bottomColor;
    void main() {
      float h = normalize(vWorld).y;
      vec3 c = mix(bottomColor, horizonColor, smoothstep(-0.55, 0.08, h));
      c = mix(c, topColor, smoothstep(0.1, 0.95, h));
      gl_FragColor = vec4(c, 1.0);
    }
  `
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.72, 0.9, 0.24));

const CAVE_SEGMENT_LEN = 160;
const CAVE_SEGMENT_RADIUS = 60;
const CAVE_VIEW = 6;
const caveSegments = new Map();

const caveWallMat = new THREE.MeshStandardMaterial({
  color: 0x394453,
  roughness: 0.88,
  metalness: 0.06,
  emissive: 0x06090f,
  emissiveIntensity: 0.28,
  side: THREE.BackSide
});

const caveRockMat = new THREE.MeshStandardMaterial({
  color: 0x4f5a68,
  roughness: 0.93,
  metalness: 0.03,
  flatShading: true
});

function caveCenterAt(z) {
  return new THREE.Vector3(
    Math.sin(z * 0.0032) * 95 + Math.sin(z * 0.009) * 24,
    Math.sin(z * 0.0046) * 42 + Math.cos(z * 0.0028) * 18,
    z
  );
}

function caveRadiusAt(z) {
  const wobble = Math.sin(z * 0.01) * 12 + Math.sin(z * 0.0038 + 1.7) * 8;
  return CAVE_SEGMENT_RADIUS + wobble;
}

function makeCaveSegment(index) {
  const startZ = index * CAVE_SEGMENT_LEN;
  const points = [];
  const steps = 16;

  for (let i = 0; i <= steps; i++) {
    const z = startZ + (i / steps) * CAVE_SEGMENT_LEN;
    points.push(caveCenterAt(z));
  }

  const path = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(path, 56, CAVE_SEGMENT_RADIUS, 20, false),
    caveWallMat
  );
  tube.receiveShadow = true;

  const group = new THREE.Group();
  group.add(tube);

  for (let i = 0; i < 6; i++) {
    const z = startZ + Math.random() * CAVE_SEGMENT_LEN;
    const center = caveCenterAt(z);
    const radius = caveRadiusAt(z) - 4;
    const ang = Math.random() * Math.PI * 2;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(4 + Math.random() * 6, 0),
      caveRockMat
    );
    rock.position.set(
      center.x + Math.cos(ang) * radius,
      center.y + Math.sin(ang) * radius,
      z
    );
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  return group;
}

function updateTerrain(playerPos) {
  const centerSeg = Math.floor(playerPos.z / CAVE_SEGMENT_LEN);
  const keep = new Set();

  for (let i = centerSeg - CAVE_VIEW; i <= centerSeg + CAVE_VIEW; i++) {
    const key = `${i}`;
    keep.add(key);
    if (!caveSegments.has(key)) {
      const seg = makeCaveSegment(i);
      caveSegments.set(key, seg);
      scene.add(seg);
    }
  }

  for (const [key, seg] of caveSegments) {
    if (!keep.has(key)) {
      seg.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      scene.remove(seg);
      caveSegments.delete(key);
    }
  }
}

const ship = new THREE.Group();
const fuselageMat = new THREE.MeshStandardMaterial({ color: 0x6f7f91, roughness: 0.35, metalness: 0.55 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0x92cfff, roughness: 0.22, metalness: 0.62, emissive: 0x1d3550, emissiveIntensity: 0.45 });
const canopyMat = new THREE.MeshPhysicalMaterial({ color: 0x82c8ff, transmission: 0.72, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });

const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.15, 9.2, 14), fuselageMat);
fuselage.rotation.x = Math.PI / 2;
fuselage.castShadow = true;
ship.add(fuselage);

const nose = new THREE.Mesh(new THREE.ConeGeometry(0.82, 2, 14), fuselageMat);
nose.rotation.x = Math.PI / 2;
nose.position.z = 5.4;
nose.castShadow = true;
ship.add(nose);

const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), canopyMat);
canopy.scale.set(1, 0.75, 1.3);
canopy.position.set(0, 0.58, 1.15);
ship.add(canopy);

const wingL = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.12, 1.8), accentMat);
wingL.position.set(-3.1, -0.05, 0.2);
wingL.rotation.z = -0.12;
wingL.castShadow = true;
ship.add(wingL);

const wingR = wingL.clone();
wingR.position.x = 3.1;
wingR.rotation.z = 0.12;
ship.add(wingR);

const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 1.7), accentMat);
tailFin.position.set(0, 0.88, -3.25);
tailFin.castShadow = true;
ship.add(tailFin);

const tailL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.7), accentMat);
tailL.position.set(-0.95, 0.2, -3.7);
tailL.castShadow = true;
ship.add(tailL);

const tailR = tailL.clone();
tailR.position.x = 0.95;
ship.add(tailR);

const engineGlow = new THREE.Mesh(
  new THREE.CircleGeometry(0.58, 20),
  new THREE.MeshBasicMaterial({ color: 0x8bd7ff })
);
engineGlow.position.z = -4.75;
engineGlow.rotation.y = Math.PI;
ship.add(engineGlow);

ship.position.set(0, 80, 0);
scene.add(ship);

const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));

const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const virtualInput = { Space: false };
const moveAxis = { x: 0, y: 0 };

function inputActive(code) {
  return keys.has(code) || virtualInput[code];
}

if (!isTouchDevice) {
  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });
} else if (hudHint) {
  hudHint.textContent = "Touch LOOK to steer · Joystick moves · THRUST boosts";
}

const mouseLook = { x: 0, y: 0 };
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const sensitivity = 0.00165;
  mouseLook.x -= e.movementY * sensitivity;
  mouseLook.y -= e.movementX * sensitivity;
  mouseLook.x = THREE.MathUtils.clamp(mouseLook.x, -1.05, 1.05);
});

let touchLookActive = false;
let touchLookPointerId = null;
let lookLastX = 0;
let lookLastY = 0;

if (mobileControls) {
  const controlButtons = mobileControls.querySelectorAll(".ctrl-btn[data-key]");
  controlButtons.forEach((btn) => {
    const key = btn.dataset.key;
    if (key !== "Space") return;
    const setPressed = (pressed) => {
      virtualInput[key] = pressed;
      btn.classList.toggle("active", pressed);
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      setPressed(true);
      btn.setPointerCapture?.(e.pointerId);
    });
    btn.addEventListener("pointerup", () => setPressed(false));
    btn.addEventListener("pointercancel", () => setPressed(false));
    btn.addEventListener("pointerleave", () => setPressed(false));
  });
}

let moveStickActive = false;
let moveStickPointerId = null;
function updateMoveKnob() {
  if (!moveKnob) return;
  moveKnob.style.left = `${50 + moveAxis.x * 28}%`;
  moveKnob.style.top = `${50 + moveAxis.y * 28}%`;
}

if (moveStick) {
  const updateAxisFromPointer = (e) => {
    const rect = moveStick.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = (e.clientX - cx) / (rect.width * 0.5);
    let dy = (e.clientY - cy) / (rect.height * 0.5);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    moveAxis.x = THREE.MathUtils.clamp(dx, -1, 1);
    moveAxis.y = THREE.MathUtils.clamp(dy, -1, 1);
    updateMoveKnob();
  };

  const resetAxis = () => {
    moveAxis.x = 0;
    moveAxis.y = 0;
    moveStickActive = false;
    moveStickPointerId = null;
    moveStick.classList.remove("active");
    updateMoveKnob();
  };

  moveStick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    moveStickActive = true;
    moveStickPointerId = e.pointerId;
    moveStick.classList.add("active");
    moveStick.setPointerCapture?.(e.pointerId);
    updateAxisFromPointer(e);
  });

  moveStick.addEventListener("pointermove", (e) => {
    if (!moveStickActive || e.pointerId !== moveStickPointerId) return;
    e.preventDefault();
    updateAxisFromPointer(e);
  });

  const endMove = (e) => {
    if (e.pointerId !== moveStickPointerId) return;
    resetAxis();
  };

  moveStick.addEventListener("pointerup", endMove);
  moveStick.addEventListener("pointercancel", endMove);
  moveStick.addEventListener("pointerleave", endMove);
  updateMoveKnob();
}

if (lookPad) {
  lookPad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    touchLookActive = true;
    touchLookPointerId = e.pointerId;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    lookPad.classList.add("active");
    lookPad.setPointerCapture?.(e.pointerId);
  });

  lookPad.addEventListener("pointermove", (e) => {
    if (!touchLookActive || e.pointerId !== touchLookPointerId) return;
    e.preventDefault();
    const dx = e.clientX - lookLastX;
    const dy = e.clientY - lookLastY;
    lookLastX = e.clientX;
    lookLastY = e.clientY;

    const touchSensitivity = 0.003;
    mouseLook.y -= dx * touchSensitivity;
    mouseLook.x -= dy * touchSensitivity;
    mouseLook.x = THREE.MathUtils.clamp(mouseLook.x, -1.05, 1.05);
  });

  const endLook = (e) => {
    if (e.pointerId !== touchLookPointerId) return;
    touchLookActive = false;
    touchLookPointerId = null;
    lookPad.classList.remove("active");
  };

  lookPad.addEventListener("pointerup", endLook);
  lookPad.addEventListener("pointercancel", endLook);
  lookPad.addEventListener("pointerleave", endLook);
}

const velocity = new THREE.Vector3(0, 0, 55);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const localUp = new THREE.Vector3();
const tmp = new THREE.Vector3();
const velocityDir = new THREE.Vector3();
const cameraGoalPos = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const cameraVel = new THREE.Vector3();

let yawRate = 0;
let pitchRate = 0;
let rollRate = 0;
let cameraFovVel = 0;

let score = 0;
let hoopsCleared = 0;
const hoops = [];
const hoopMaterial = new THREE.MeshStandardMaterial({
  color: 0xffdca0,
  emissive: 0xff8a2c,
  emissiveIntensity: 0.84,
  roughness: 0.24,
  metalness: 0.45
});

function hoopCounterLabel() {
  return `Hoops: ${hoopsCleared}`;
}

function ensureHoopCounter() {
  let label = document.getElementById("hoops");
  if (!label) {
    label = document.createElement("div");
    label.id = "hoops";
    document.getElementById("hud").insertBefore(label, speedLabel.nextSibling);
  }
  label.textContent = hoopCounterLabel();
}

function spawnHoop(distance = 320 + Math.random() * 320) {
  ship.getWorldDirection(forward);
  const baseZ = ship.position.z + forward.z * distance;
  const center = caveCenterAt(baseZ);
  const radius = Math.max(35, caveRadiusAt(baseZ) - 20);
  const offsetAngle = Math.random() * Math.PI * 2;
  const offsetLen = Math.random() * radius * 0.45;

  const base = new THREE.Vector3(
    center.x + Math.cos(offsetAngle) * offsetLen,
    center.y + Math.sin(offsetAngle) * offsetLen,
    baseZ
  );

  const ring = new THREE.Mesh(new THREE.TorusGeometry(17.5, 1.8, 16, 44), hoopMaterial.clone());
  ring.position.copy(base);
  ring.lookAt(ship.position.x, ship.position.y, ship.position.z);
  ring.castShadow = true;
  ring.userData.passed = false;

  const glow = new THREE.PointLight(0xffa45d, 1.4, 115, 2);
  glow.position.copy(base);
  ring.userData.glow = glow;

  scene.add(ring);
  scene.add(glow);
  hoops.push(ring);
}

for (let i = 0; i < 10; i++) spawnHoop(240 + i * 110);

const clock = new THREE.Clock();

function constrainToCave() {
  const center = caveCenterAt(ship.position.z);
  const radius = caveRadiusAt(ship.position.z) - 4.5;

  tmp.set(ship.position.x - center.x, ship.position.y - center.y, 0);
  const dist = tmp.length();
  if (dist > radius) {
    const normal = tmp.normalize();
    ship.position.x = center.x + normal.x * radius;
    ship.position.y = center.y + normal.y * radius;

    const outwardSpeed = velocity.x * normal.x + velocity.y * normal.y;
    if (outwardSpeed > 0) {
      velocity.x -= normal.x * outwardSpeed * 1.45;
      velocity.y -= normal.y * outwardSpeed * 1.45;
    }

    velocity.multiplyScalar(0.986);
    pitchRate *= 0.9;
    rollRate *= 0.9;
  }
}

function updateShip(dt) {
  const pointerLocked = document.pointerLockElement === canvas;
  const hasLookControl = pointerLocked || touchLookActive || isTouchDevice;
  const keyForward = (inputActive("KeyW") ? 1 : 0) - (inputActive("KeyS") ? 1 : 0);
  const keyStrafe = (inputActive("KeyD") ? 1 : 0) - (inputActive("KeyA") ? 1 : 0);
  const inputForward = THREE.MathUtils.clamp(keyForward - moveAxis.y, -1, 1);
  const inputStrafe = THREE.MathUtils.clamp(keyStrafe + moveAxis.x, -1, 1);
  const thrustInput = inputActive("Space") ? 1 : 0;

  const targetPitch = hasLookControl ? mouseLook.x : ship.rotation.x;
  const targetYaw = hasLookControl ? mouseLook.y : ship.rotation.y;
  const targetRoll = -inputStrafe * 0.66 + THREE.MathUtils.clamp(rollRate * -0.2, -0.3, 0.3);

  const pitchAccel = (targetPitch - ship.rotation.x) * 29.0;
  const yawAccel = (targetYaw - ship.rotation.y) * 24.5;
  const rollAccel = (targetRoll - ship.rotation.z) * 24.0;

  pitchRate += pitchAccel * dt;
  yawRate += yawAccel * dt;
  rollRate += rollAccel * dt;

  const angularDrag = Math.exp(-dt * 6.2);
  pitchRate *= angularDrag;
  yawRate *= angularDrag;
  rollRate *= angularDrag;

  ship.rotation.x += pitchRate * dt;
  ship.rotation.y += yawRate * dt;
  ship.rotation.z += rollRate * dt;

  ship.getWorldDirection(forward);
  right.set(1, 0, 0).applyQuaternion(ship.quaternion).normalize();
  localUp.set(0, 1, 0).applyQuaternion(ship.quaternion).normalize();

  const speed = velocity.length();
  if (speed > 0.001) {
    velocityDir.copy(velocity).multiplyScalar(1 / speed);
  } else {
    velocityDir.copy(forward);
  }

  const forwardSpeed = velocity.dot(forward);
  const sideSlip = velocity.dot(right);
  const aoa = forward.angleTo(velocityDir);
  const aoaFactor = THREE.MathUtils.clamp(1.28 - aoa * 1.45, 0.06, 1.25);

  velocity.addScaledVector(tmp.set(0, -24, 0), dt);

  const throttleForce = 15 + thrustInput * 72 + Math.max(0, inputForward) * 22;
  velocity.addScaledVector(forward, throttleForce * dt);

  const profileDrag = 0.0044 * speed * speed + 0.032 * speed;
  velocity.addScaledVector(velocityDir, -profileDrag * dt);

  const inducedDrag = (Math.abs(aoa) * 9 + Math.abs(sideSlip) * 0.085) * speed * 0.012;
  velocity.addScaledVector(velocityDir, -inducedDrag * dt);

  const liftStrength = (Math.max(0, forwardSpeed) * 0.21 + speed * speed * 0.0025) * aoaFactor;
  velocity.addScaledVector(localUp, liftStrength * dt);

  const sideDamp = -sideSlip * (2 + speed * 0.0155);
  velocity.addScaledVector(right, sideDamp * dt);

  if (inputForward < 0) {
    velocity.addScaledVector(forward, inputForward * 18 * dt);
  }

  velocity.addScaledVector(right, inputStrafe * 19 * dt);

  if (speed > 38) {
    ship.rotation.z *= Math.exp(-dt * 0.48);
  }

  const minFlightSpeed = 28;
  const maxFlightSpeed = 172;
  const newSpeed = velocity.length();
  if (newSpeed < minFlightSpeed) {
    velocity.addScaledVector(forward, (minFlightSpeed - newSpeed) * 0.9);
  } else if (newSpeed > maxFlightSpeed) {
    velocity.multiplyScalar(maxFlightSpeed / newSpeed);
  }

  ship.position.addScaledVector(velocity, dt);
  constrainToCave();

  const speedRatio = THREE.MathUtils.clamp(newSpeed / maxFlightSpeed, 0, 1);
  const desiredFov = 72 + speedRatio * 11;
  const fovAccel = (desiredFov - camera.fov) * 18;
  cameraFovVel += fovAccel * dt;
  cameraFovVel *= Math.exp(-dt * 8.5);
  camera.fov += cameraFovVel * dt;
  camera.updateProjectionMatrix();

  cameraGoalPos.copy(ship.position)
    .addScaledVector(localUp, 7 + speedRatio * 2.8)
    .addScaledVector(forward, -24 - speedRatio * 8)
    .addScaledVector(right, ship.rotation.z * 3.1);

  const camSpring = 25;
  const camDamp = 9.5;
  tmp.copy(cameraGoalPos).sub(camera.position).multiplyScalar(camSpring * dt);
  cameraVel.add(tmp);
  cameraVel.multiplyScalar(Math.exp(-camDamp * dt));
  camera.position.addScaledVector(cameraVel, dt);

  cameraLookTarget.copy(ship.position)
    .addScaledVector(forward, 32 + speedRatio * 26)
    .addScaledVector(velocityDir, 9 + speedRatio * 15)
    .addScaledVector(localUp, 4);
  camera.lookAt(cameraLookTarget);

  scoreLabel.textContent = `Score: ${score}`;
  const focusHint = isTouchDevice ? "" : pointerLocked ? "" : " (click to focus)";
  speedLabel.textContent = `Speed: ${Math.round(velocity.length())}${focusHint}`;
  ensureHoopCounter();
}

function updateHoops(dt) {
  const counter = document.getElementById("hoops");

  for (let i = hoops.length - 1; i >= 0; i--) {
    const hoop = hoops[i];
    hoop.rotation.y += dt * 0.55;

    const dist = hoop.position.distanceTo(ship.position);
    if (!hoop.userData.passed && dist < 18.5) {
      hoop.userData.passed = true;
      score += 100;
      hoopsCleared += 1;
      hoop.material.emissiveIntensity = 2.2;
      if (counter) counter.textContent = hoopCounterLabel();
    }

    if (dist > 620 || hoop.position.z < ship.position.z - 120) {
      scene.remove(hoop);
      if (hoop.userData.glow) scene.remove(hoop.userData.glow);
      hoop.geometry.dispose();
      hoop.material.dispose();
      hoops.splice(i, 1);
      spawnHoop();
    }
  }

  while (hoops.length < 11) spawnHoop();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  updateShip(dt);
  updateTerrain(ship.position);
  updateHoops(dt);

  sun.position.x = ship.position.x + 130;
  sun.position.y = ship.position.y + 210;
  sun.position.z = ship.position.z + 110;
  sun.target.position.copy(ship.position);
  scene.add(sun.target);

  composer.render();
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

ensureHoopCounter();
updateTerrain(ship.position);
animate();
