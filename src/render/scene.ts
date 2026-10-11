/**
 * 场景骨架：渲染器（LogarithmicDepthBuffer 对抗深度跨度）、相机、
 * OrbitControls（阻尼/缩放/平移）、光照、程序化星空背景。
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** 世界组：每帧 position = −浮动原点（真实比例模式对抗 float32 精度） */
  world: THREE.Group;
  sunLight: THREE.PointLight;
  starfield: THREE.Points;
}

function makeStarfield(count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  // 确定性伪随机（每次加载星空一致）
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    // 球面均匀分布
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const R = 3800;
    pos[i * 3] = R * s * Math.cos(th);
    pos[i * 3 + 1] = R * u;
    pos[i * 3 + 2] = R * s * Math.sin(th);
    const b = 0.4 + rnd() * 0.6;
    const tint = rnd();
    col[i * 3] = b * (tint > 0.85 ? 1.0 : tint > 0.7 ? 0.9 : 0.82);
    col[i * 3 + 1] = b * 0.88;
    col[i * 3 + 2] = b * (tint > 0.7 ? 0.85 : 1.0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  return new THREE.Points(geo, mat);
}

export function createScene(canvas: HTMLCanvasElement): SceneKit {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  const starfield = makeStarfield(6000);
  scene.add(starfield);

  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.002, 9000);
  camera.position.set(-38, 52, 92);
  scene.add(camera); // 星空在真实比例下挂到相机上，相机必须入场景图才会渲染其子节点

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.02;
  controls.maxDistance = 4000;
  controls.zoomSpeed = 1.2;
  controls.rotateSpeed = 0.6;
  // 右键平移 / 中键缩放（默认），触屏双指缩放平移
  controls.screenSpacePanning = true;

  // 太阳光：无衰减点光（观赏模式下行星亮度与距离无关，避免外行星全黑）；
  // 挂在 world 组内，每帧由 main 同步到太阳位置（真实比例下太阳不在根原点）
  const sunLight = new THREE.PointLight(0xfff2dd, 2.8, 0, 0);
  world.add(sunLight);
  scene.add(new THREE.AmbientLight(0x3a4466, 0.45));

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  return { renderer, scene, camera, controls, world, sunLight, starfield };
}
