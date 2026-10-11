/**
 * 真实贴图层（规格 §5）：Solar System Scope 2K 等距圆柱投影贴图（CC BY 4.0，源自 NASA/USGS 数据）。
 * 异步加载并替换程序化占位贴图；加载失败（离线）时保留程序化贴图，保证离线可玩。
 */
import * as THREE from "three";
import type { BodyRegistry } from "./bodies";

/** 天体 id → 贴图路径（public/textures/，拼接 BASE_URL 以兼容 Pages 子路径部署） */
export const REAL_TEXTURES: Record<string, string> = {
  sun: "textures/2k_sun.jpg",
  mercury: "textures/2k_mercury.jpg",
  venus: "textures/2k_venus_surface.jpg",
  earth: "textures/2k_earth_daymap.jpg",
  mars: "textures/2k_mars.jpg",
  jupiter: "textures/2k_jupiter.jpg",
  saturn: "textures/2k_saturn.jpg",
  uranus: "textures/2k_uranus.jpg",
  neptune: "textures/2k_neptune.jpg",
  moon: "textures/2k_moon.jpg",
};

export const RING_TEXTURE_URL = "textures/2k_saturn_ring_alpha.png";

const loader = new THREE.TextureLoader();

function load(url: string, onReady: (tex: THREE.Texture) => void) {
  loader.load(
    import.meta.env.BASE_URL + url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.RepeatWrapping;
      onReady(tex);
    },
    undefined,
    () => {}, // 离线/缺文件：静默保留程序化贴图
  );
}

function swapMap(mat: THREE.Material, tex: THREE.Texture) {
  const m = mat as THREE.Material & { map?: THREE.Texture | null };
  const old = m.map;
  m.map = tex;
  m.needsUpdate = true;
  old?.dispose();
}

export function applyRealTextures(reg: BodyRegistry) {
  for (const b of reg.all) {
    const url = REAL_TEXTURES[b.id];
    if (!url) continue;
    load(url, (tex) => swapMap(b.mesh.material as THREE.Material, tex));
  }
  const saturn = reg.byId.get("saturn");
  if (saturn) {
    saturn.pivot.traverse((o) => {
      if (o.name === "ring") load(RING_TEXTURE_URL, (tex) => swapMap((o as THREE.Mesh).material as THREE.Material, tex));
    });
  }
}
