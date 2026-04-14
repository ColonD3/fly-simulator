import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const canvas = document.getElementById("scene");
const scoreLabel = document.getElementById("score");
const speedLabel = document.getElementById("speed");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7aa5d6, 0.0028);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(0, 30, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;

const hemi = new THREE.HemisphereLight(0xb8daff, 0x29341f, 0.62);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff0d5, 1.26);
sun.position.set(140, 210, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 700;
sun.shadow.camera.left = -280;
sun.shadow.camera.right = 280;
sun.shadow.camera.top = 280;
sun.shadow.camera.bottom = -280;
scene.add(sun);

const skyGeo = new THREE.SphereGeometry(2200, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x8bc3ff) },
    horizonColor: { value: new THREE.Color(0xd8f2ff) },
    bottomColor: { value: new THREE.Color(0xf0b37b) }
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
      vec3 c = mix(bottomColor, horizonColor, smoothstep(-0.45, 0.04, h));
      c = mix(c, topColor, smoothstep(0.02, 0.9, h));
      gl_FragColor = vec4(c, 1.0);
    }
  `
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.8, 0.3));

const CHUNK_SIZE = 180;
const CHUNK_RES = 50;
const VIEW_RADIUS = 3;
const terrainChunks = new Map();

const terrainMat = new THREE.MeshStandardMaterial({
  color: 0x69895b,
  roughness: 0.95,
  metalness: 0.02,
  flatShading: false
});

function heightAt(x, z) {
  const h1 = Math.sin(x * 0.017) * 24;
  const h2 = Math.cos(z * 0.013) * 18;
  const h3 = Math.sin((x + z) * 0.008) * 34;
  const ridge = Math.sin(x * 0.004 + z * 0.008) * Math.cos(z * 0.003) * 44;
  return h1 + h2 + h3 + ridge - 22;
}

function makeChunk(cx, cz) {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = lx + cx * CHUNK_SIZE;
    const wz = lz + cz * CHUNK_SIZE;
    pos.setY(i, heightAt(wx, wz));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  return mesh;
}

function updateTerrain(playerPos) {
  const centerX = Math.floor(playerPos.x / CHUNK_SIZE);
  const centerZ = Math.floor(playerPos.z / CHUNK_SIZE);
  const keep = new Set();

  for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const cx = centerX + dx;
      const cz = centerZ + dz;
      const key = `${cx},${cz}`;
      keep.add(key);
      if (!terrainChunks.has(key)) {
        const chunk = makeChunk(cx, cz);
        terrainChunks.set(key, chunk);
        scene.add(chunk);
      }
    }
  }

  for (const [key, mesh] of terrainChunks) {
    if (!keep.has(key)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      terrainChunks.delete(key);
    }
  }
}

const ship = new THREE.Group();
const shipMat = new THREE.MeshStandardMaterial({ color: 0x2a3b52, roughness: 0.4, metalness: 0.3 });
const wingMat = new THREE.MeshStandardMaterial({ color: 0x8fd7ff, roughness: 0.25, metalness: 0.4, emissive: 0x103040, emissiveIntensity: 0.4 });

const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.2, 4, 8), shipMat);
body.rotation.z = Math.PI / 2;
body.castShadow = true;
ship.add(body);

const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 5.5), wingMat);
leftWing.position.set(0, 0, -2.8);
leftWing.castShadow = true;
ship.add(leftWing);

const rightWing = leftWing.clone();
rightWing.position.z = 2.8;
ship.add(rightWing);

ship.position.set(0, 80, 0);
scene.add(ship);

const keys = new Set();
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));

const velocity = new THREE.Vector3(0, -0.1, 42);
const forward = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

let score = 0;
const hoops = [];
const hoopMaterial = new THREE.MeshStandardMaterial({
  color: 0xffbf66,
  emissive: 0x6b3c00,
  emissiveIntensity: 0.65,
  roughness: 0.28,
  metalness: 0.35
});

function spawnHoop(distance = 300 + Math.random() * 280) {
  ship.getWorldDirection(forward);
  const base = ship.position.clone().add(forward.multiplyScalar(distance));
  base.x += (Math.random() - 0.5) * 120;
  base.z += (Math.random() - 0.5) * 120;
  const floor = heightAt(base.x, base.z) + 18;
  base.y = floor + 26 + Math.random() * 55;

  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 12, 36), hoopMaterial);
  ring.position.copy(base);
  ring.lookAt(ship.position.x, ship.position.y + 8, ship.position.z);
  ring.castShadow = true;
  ring.receiveShadow = false;
  ring.userData.passed = false;

  scene.add(ring);
  hoops.push(ring);
}

for (let i = 0; i < 9; i++) spawnHoop(220 + i * 95);

const clock = new THREE.Clock();

function updateShip(dt) {
  const pitch = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  const roll = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const yaw = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);

  ship.rotateX(pitch * dt * 1.35);
  ship.rotateY(yaw * dt * 0.95);
  ship.rotateZ(-roll * dt * 1.65);

  ship.getWorldDirection(forward);

  const gravity = -11.2;
  velocity.y += gravity * dt;

  const glideLift = Math.max(0, forward.y + 0.32) * 24;
  velocity.y += glideLift * dt;

  const baseSpeed = 56;
  const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.5 : 1;
  const targetForward = baseSpeed * boost;

  const lateralDamp = 0.985;
  velocity.multiplyScalar(lateralDamp);
  velocity.add(forward.clone().multiplyScalar((targetForward - velocity.dot(forward)) * 0.08));

  ship.position.addScaledVector(velocity, dt);

  const floor = heightAt(ship.position.x, ship.position.z) + 6;
  if (ship.position.y < floor) {
    ship.position.y = floor;
    velocity.y = Math.max(4, Math.abs(velocity.y) * 0.5);
  }

  const camOffset = new THREE.Vector3(0, 8, -24).applyQuaternion(ship.quaternion);
  camera.position.copy(ship.position).add(camOffset);
  camera.lookAt(ship.position.clone().add(forward.clone().multiplyScalar(36)));

  scoreLabel.textContent = `Score: ${score}`;
  speedLabel.textContent = `Speed: ${Math.round(velocity.length())}`;
}

function updateHoops(dt) {
  for (let i = hoops.length - 1; i >= 0; i--) {
    const hoop = hoops[i];
    hoop.rotation.y += dt * 0.6;

    const dist = hoop.position.distanceTo(ship.position);
    if (!hoop.userData.passed && dist < 10.5) {
      hoop.userData.passed = true;
      score += 100;
      hoop.material = hoop.material.clone();
      hoop.material.emissiveIntensity = 1.35;
    }

    if (dist > 430) {
      scene.remove(hoop);
      hoop.geometry.dispose();
      hoop.material.dispose();
      hoops.splice(i, 1);
      spawnHoop();
    }
  }

  while (hoops.length < 10) spawnHoop();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  updateShip(dt);
  updateTerrain(ship.position);
  updateHoops(dt);

  sun.position.x = ship.position.x + 140;
  sun.position.z = ship.position.z + 90;
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

updateTerrain(ship.position);
animate();
