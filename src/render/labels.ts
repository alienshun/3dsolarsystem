/**
 * HTML 标签层：每帧把天体显示位置投影到屏幕坐标。
 * 点击标签 = 点击天体（回调给主模块处理选中/信息卡）。
 */
import * as THREE from "three";
import type { BodyRegistry, SimBody } from "./bodies";

const _v = new THREE.Vector3();

export class Labels {
  private container: HTMLDivElement;
  private items = new Map<string, { el: HTMLDivElement; body: SimBody }>();

  constructor(private reg: BodyRegistry, onSelect: (id: string) => void) {
    this.container = document.createElement("div");
    this.container.id = "label-layer";
    this.container.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden;";
    document.getElementById("app")!.appendChild(this.container);

    for (const b of reg.all) {
      const el = document.createElement("div");
      el.className = "body-label" + (b.kind === "moon" ? " moon" : "") + (b.kind === "star" ? " sun" : "");
      el.textContent = b.name;
      el.style.cssText = "position:absolute;pointer-events:auto;";
      el.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        onSelect(b.id);
      });
      this.container.appendChild(el);
      this.items.set(b.id, { el, body: b });
    }
  }

  setSelected(id: string | null) {
    for (const [bid, it] of this.items) it.el.classList.toggle("selected", bid === id);
  }

  /** 天体投影半径（px） */
  private pxRadius(b: SimBody, camera: THREE.PerspectiveCamera): number {
    _v.copy(b.rootPos);
    const dist = _v.distanceTo(camera.position);
    if (dist <= 0) return Infinity;
    const fovRad = (camera.fov * Math.PI) / 180;
    return (b.dispR / (2 * dist * Math.tan(fovRad / 2))) * window.innerHeight;
  }

  /** 标签抬高量：天体投影半径（px）+ 固定余量，避免文字压在天体上 */
  private screenOffset(b: SimBody, camera: THREE.PerspectiveCamera): number {
    const r = this.pxRadius(b, camera);
    return Math.min(60, Math.max(10, (r === Infinity ? 30 : r) + 6));
  }

  update(camera: THREE.PerspectiveCamera, opts: { showLabels: boolean; showMoons: boolean }) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const [, { el, body }] of this.items) {
      const visible = opts.showLabels && (body.kind !== "moon" || opts.showMoons);
      if (!visible || !body.pivot.visible) { el.style.display = "none"; continue; }
      // 卫星标签：母行星系统屏幕尺寸太小时隐藏，避免文字堆叠
      if (body.kind === "moon") {
        const parent = this.reg.byId.get(body.parentId!)!;
        if (this.pxRadius(parent, camera) < 22) { el.style.display = "none"; continue; }
      }
      _v.copy(body.rootPos).project(camera);
      if (_v.z > 1 || _v.z < -1) { el.style.display = "none"; continue; }
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) { el.style.display = "none"; continue; }
      el.style.display = "block";
      el.style.left = `${sx}px`;
      el.style.top = `${sy - this.screenOffset(body, camera)}px`;
    }
  }
}
