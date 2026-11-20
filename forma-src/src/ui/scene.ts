/**
 * 3D-сцена на three.js. Строится из ManufacturingModel — тех же деталей, что идут в документы.
 * Единицы сцены — метры (мм / 1000). Оси совпадают с миром ядра: X вправо, Y вверх, Z к зрителю.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ManufacturingModel, Part, ProductConfig } from '../core/schema';
import { finishHex, isWoodLike, METALS } from '../core/materials';
import { partBox } from '../core/engine';

export type ViewOpts = { doors: boolean; drawers: boolean; interior: boolean; exploded: boolean; dims: boolean };
const S = 0.001;
const texCache = new Map<string, THREE.Texture>();

function woodTexture(hex: string, along: 'x' | 'y'): THREE.Texture {
  const key = hex + along; if (texCache.has(key)) return texCache.get(key)!;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d')!;
  const base = new THREE.Color(hex); g.fillStyle = hex; g.fillRect(0, 0, 256, 256);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 256, a = 0.05 + rnd() * 0.12, w = 0.6 + rnd() * 2.2, c = base.clone().offsetHSL(0, 0.02, -0.12 - rnd() * 0.1);
    g.strokeStyle = `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`; g.lineWidth = w; g.beginPath();
    for (let x = 0; x <= 256; x += 8) { const yy = y + Math.sin(x / 40 + i) * 3 + Math.sin(x / 13 + i * 2) * 0.8; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  if (along === 'y') { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  texCache.set(key, t); return t;
}

function matFor(p: Part, c: ProductConfig): THREE.Material {
  const metal = (code: string) => (METALS.find(m => m.code === code) || METALS[0]).hex;
  if (p.geom === 'handle' || p.geom === 'profile') return new THREE.MeshStandardMaterial({ color: metal(c.handles.color), metalness: 0.8, roughness: 0.35 });
  if (p.geom === 'tube') return new THREE.MeshStandardMaterial({ color: metal(c.base.metalColor), metalness: 0.5, roughness: 0.55 });
  if (p.geom === 'rod') return new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.25 });
  if (p.geom === 'mirror') return new THREE.MeshStandardMaterial({ color: '#c9d6dc', metalness: 0.95, roughness: 0.06, side: THREE.DoubleSide });
  if (p.geom === 'slat') return new THREE.MeshStandardMaterial({ color: '#e3cfa6', roughness: 0.6 });
  if (p.geom === 'leg') return c.base.type === 'legs-metal' ? new THREE.MeshStandardMaterial({ color: metal(c.base.metalColor), metalness: 0.8, roughness: 0.3 })
    : new THREE.MeshStandardMaterial({ color: '#c9a273', roughness: 0.7 });
  if (!p.finish) { // задние стенки, днища, короба
    const col = p.material === 'hdf' ? '#d9d2c5' : p.material === 'plywood' || p.material === 'plywood-thin' ? '#dcc8a6' : '#efeeea';
    return new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
  }
  const hex = finishHex(p.finish), rough = p.finish.sheen === 'gloss' ? 0.15 : p.finish.sheen === 'satin' ? 0.4 : 0.75, side = p.geom === 'panel-radius' ? THREE.DoubleSide : THREE.FrontSide;
  if (isWoodLike(p.finish)) {
    const along = p.axes[0] === 'y' ? 'y' : 'x';
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTexture(hex, along as any), roughness: Math.max(rough, 0.45), side });
  }
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, side });
}

function geomFor(p: Part): THREE.BufferGeometry {
  const b = partBox(p), w = (b.max[0] - b.min[0]) * S, h = (b.max[1] - b.min[1]) * S, d = (b.max[2] - b.min[2]) * S;
  if (p.geom === 'rod') return new THREE.CylinderGeometry(0.0125, 0.0125, w, 20).rotateZ(Math.PI / 2);
  if (p.geom === 'leg') { const top = p.material === 'wood' ? 0.019 : 0.012, bot = p.material === 'wood' ? 0.012 : 0.01; return new THREE.CylinderGeometry(top, bot, h, 20); }
  if (p.geom === 'handle' && p.L < 40) return new THREE.CylinderGeometry(0.014, 0.011, d, 24).rotateX(Math.PI / 2);
  if (p.geom === 'handle') {
    const vert = p.axes[0] === 'y', len = (vert ? h : w);
    const grp = new THREE.CylinderGeometry(0.006, 0.006, len, 12); if (!vert) grp.rotateZ(Math.PI / 2); grp.translate(0, 0, d / 2 - 0.006);
    return grp;
  }
  if (p.geom === 'panel-radius' || (p.geom === 'mirror' && p.ops.some(o => o.type === 'radius'))) {
    // форма в локальных осях детали (L — x, W — y, скругление у кромки L2), затем поворот в мировые оси
    const L = p.L * S, Wd = p.W * S, T = p.thickness * S, r = Math.min((p.ops.find(o => o.type === 'radius')?.params.r || 0) * S, L / 2, Wd);
    const sh = new THREE.Shape(), x0 = -L / 2, x1 = L / 2, y0 = -Wd / 2, y1 = Wd / 2;
    sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1 - r); if (r > 0) sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1); if (r > 0) sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 16 }); g.translate(0, 0, -T / 2);
    const e = (a: string) => a === 'x' ? new THREE.Vector3(1, 0, 0) : a === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(e(p.axes[0]), e(p.axes[1]), e(p.axes[2])));
    return g;
  }
  return new THREE.BoxGeometry(w, h, d);
}

export class FormaScene {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  root = new THREE.Group(); dimsGroup = new THREE.Group(); meshes = new Map<string, THREE.Mesh>();
  model: ManufacturingModel | null = null; config: ProductConfig | null = null;
  opts: ViewOpts = { doors: false, drawers: false, interior: false, exploded: false, dims: true };
  anim = { door: 0, drawer: 0, explode: 0, fade: 1 }; selected: string | null = null;
  onSelect: (id: string | null) => void = () => {};
  private raf = 0; private down: { x: number; y: number } | null = null; private ro: ResizeObserver | null = null;
  constructor(private host: HTMLElement, opts?: { preserve?: boolean; offscreen?: { w: number; h: number } }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts?.preserve, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color('#f3f1ec');
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const hemi = new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.1); this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(1.5, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.1, far: 10 }); this.scene.add(key);
    const fill = new THREE.DirectionalLight('#fff4e6', 0.5); fill.position.set(-2, 1.5, 1); this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.scene.add(this.root, this.dimsGroup);
    if (opts?.offscreen) { this.renderer.setSize(opts.offscreen.w, opts.offscreen.h, false); this.camera.aspect = opts.offscreen.w / opts.offscreen.h; this.camera.updateProjectionMatrix(); }
    else {
      host.appendChild(this.renderer.domElement); this.renderer.domElement.style.touchAction = 'none';
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
      const el = this.renderer.domElement;
      el.addEventListener('pointerdown', e => { this.down = { x: e.clientX, y: e.clientY }; });
      el.addEventListener('pointerup', e => { if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 6) this.pick(e); this.down = null; });
      this.controls.addEventListener('change', () => this.kick()); el.addEventListener('pointerdown', () => this.kick()); el.addEventListener('wheel', () => this.kick(), { passive: true }); this.kick();
    }
  }
  dispose() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
  resize() { const w = this.host.clientWidth || 300, h = this.host.clientHeight || 300; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.host.isConnected) this.kick(); }

  setModel(m: ManufacturingModel, c: ProductConfig, keepView = true) {
    const first = !this.model; this.model = m; this.config = c;
    for (const ch of [...this.root.children]) { this.root.remove(ch); (ch as THREE.Mesh).geometry?.dispose(); }
    this.meshes.clear(); this.handleMap.clear();
    for (const p of m.parts) {
      const mesh = new THREE.Mesh(geomFor(p), matFor(p, c)); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.id = p.id;
      const b = partBox(p); mesh.userData.center = new THREE.Vector3((b.min[0] + b.max[0]) / 2 * S, (b.min[1] + b.max[1]) / 2 * S, (b.min[2] + b.max[2]) / 2 * S);
      mesh.position.copy(mesh.userData.center);
      if (p.geom === 'panel' || p.geom === 'panel-radius') {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12 }));
        mesh.add(edges);
      }
      const mf = p.ops.find(o => o.type === 'mill-frame');
      if (mf) { // декоративная рамка на лицевой стороне
        const ins = mf.params.inset * S, bw = (b.max[0] - b.min[0]) * S, bh = (b.max[1] - b.min[1]) * S, dz = (b.max[2] - b.min[2]) * S / 2 + 0.0004;
        const pts = [[-bw / 2 + ins, -bh / 2 + ins], [bw / 2 - ins, -bh / 2 + ins], [bw / 2 - ins, bh / 2 - ins], [-bw / 2 + ins, bh / 2 - ins], [-bw / 2 + ins, -bh / 2 + ins]].map(([x, y]) => new THREE.Vector3(x, y, dz));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 })); mesh.add(line);
      }
      this.root.add(mesh); this.meshes.set(p.id, mesh);
    }
    for (const gh of m.ghosts || []) {
      const w = (gh.max[0] - gh.min[0]) * S, h = (gh.max[1] - gh.min[1]) * S, d = (gh.max[2] - gh.min[2]) * S;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.95, transparent: true, opacity: 0.9 }));
      mesh.position.set((gh.min[0] + gh.max[0]) / 2 * S, (gh.min[1] + gh.max[1]) / 2 * S, (gh.min[2] + gh.max[2]) / 2 * S); mesh.castShadow = true; mesh.userData.ghost = true; this.root.add(mesh);
    }
    this.buildDims(); this.applyPose(true); this.highlight();
    if (first || !keepView) this.view('iso');
    if (this.host.isConnected) this.kick();
  }
  setOpts(o: Partial<ViewOpts>) { Object.assign(this.opts, o); this.dimsGroup.visible = this.opts.dims; if (this.raf !== undefined && this.host.isConnected) this.kick(); }
  private center() { const b = this.model!.overall; return new THREE.Vector3(b.width / 2 * S, b.height / 2 * S, b.depth / 2 * S - (this.model!.body.z0 * S)); }
  view(v: 'iso' | 'front' | 'side' | 'top') {
    if (!this.model) return;
    const o = this.model.overall, c = this.center(), size = Math.max(o.width, o.height, o.depth) * S, dist = size * 2.6 + 0.4;
    const dir = v === 'front' ? new THREE.Vector3(0, 0, 1) : v === 'side' ? new THREE.Vector3(1, 0, 0) : v === 'top' ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0.75, 0.45, 1).normalize();
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(dist))); this.controls.target.copy(c); this.controls.update(); if (this.host.isConnected) this.kick();
  }
  /** Положение подвижных деталей и разнесённый вид. */
  applyPose(instant = false) {
    const m = this.model; if (!m) return;
    const tgt = { door: this.opts.doors ? 1 : 0, drawer: this.opts.drawers ? 1 : 0, explode: this.opts.exploded ? 1 : 0, fade: this.opts.interior ? 0 : 1 };
    for (const k of Object.keys(tgt) as (keyof typeof tgt)[]) this.anim[k] = instant ? tgt[k] : this.anim[k] + (tgt[k] - this.anim[k]) * 0.18;
    const ctr = this.center();
    for (const p of m.parts) {
      const mesh = this.meshes.get(p.id)!; mesh.position.copy(mesh.userData.center); mesh.rotation.set(0, 0, 0);
      const ex = mesh.userData.center.clone().sub(ctr).multiplyScalar(0.55 * this.anim.explode);
      if (p.group === 'fronts' || p.group === 'handles') ex.z += 0.25 * this.anim.explode;
      if (p.group === 'top') ex.y += 0.15 * this.anim.explode;
      if (p.group === 'base') ex.y -= 0.12 * this.anim.explode;
      if (p.group === 'back') ex.z -= 0.2 * this.anim.explode;
      mesh.position.add(ex);
    }
    for (const mv of m.moving) {
      if (mv.kind === 'drawer') { const ax = mv.axis === 'x' ? 'x' : 'z'; for (const id of mv.parts) this.meshes.get(id)!.position[ax] += mv.travel * S * this.anim.drawer; const h = this.handleOf(mv.front); if (h) h.position[ax] += mv.travel * S * this.anim.drawer; }
      else {
        const ang = mv.axisSign * (Math.PI / 180) * 100 * this.anim.door; // петля слева — правый край идёт к зрителю
        for (const mesh of [this.meshes.get(mv.front)!, this.handleOf(mv.front)].filter(Boolean) as THREE.Mesh[]) {
          const pivot = new THREE.Vector3(mv.hinge[0] * S, mesh.position.y, mv.hinge[2] * S);
          const rel = mesh.position.clone().sub(pivot); rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); mesh.position.copy(pivot.add(rel)); mesh.rotation.y = ang;
        }
      }
    }
    for (const p of m.parts) {
      const mesh = this.meshes.get(p.id)!, front = p.group === 'fronts' || p.group === 'handles';
      const mat = mesh.material as THREE.MeshStandardMaterial; mat.transparent = front && this.anim.fade < 0.99; mat.opacity = front ? 0.12 + 0.88 * this.anim.fade : 1;
      mesh.visible = !(front && this.anim.fade < 0.02);
    }
  }
  private handleMap = new Map<string, string>();
  handleOf(frontId: string) {
    if (!this.handleMap.size && this.model) for (const j of this.model.joints) if (j.kind === 'handle' && j.parts[1]) this.handleMap.set(j.parts[0], j.parts[1]);
    const id = this.handleMap.get(frontId); return id ? this.meshes.get(id) : undefined;
  }
  select(id: string | null) { this.selected = id; this.highlight(); if (this.host.isConnected) this.kick(); }
  private highlight() { for (const [id, mesh] of this.meshes) { const m = mesh.material as THREE.MeshStandardMaterial; if (m.emissive) m.emissive.set(id === this.selected ? '#ff7a1a' : '#000000'); if (m.emissiveIntensity !== undefined) m.emissiveIntensity = id === this.selected ? 0.45 : 0; } }
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.camera);
    const hit = rc.intersectObjects([...this.meshes.values()].filter(m => m.visible), false)[0];
    const id = hit ? hit.object.userData.id as string : null; this.select(id); this.onSelect(id);
  }
  private label(text: string, pos: THREE.Vector3, scale = 1) {
    const cv = document.createElement('canvas'); const g = cv.getContext('2d')!; g.font = 'bold 44px system-ui, sans-serif';
    const w = Math.ceil(g.measureText(text).width) + 28; cv.width = w; cv.height = 64; g.font = 'bold 44px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); (g as any).roundRect ? (g as any).roundRect(0, 0, w, 64, 14) : g.rect(0, 0, w, 64); g.fill();
    g.fillStyle = '#1d2a33'; g.textBaseline = 'middle'; g.fillText(text, 14, 34);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.renderOrder = 10;
    const hgt = 0.035 * scale; sp.scale.set(hgt * w / 64, hgt, 1); sp.position.copy(pos); return sp;
  }
  private buildDims() {
    this.dimsGroup.clear(); const m = this.model!; const o = m.overall, z1 = (o.depth - m.body.z0) * S + 0.04 - m.body.z0 * S;
    const W = o.width * S, H = o.height * S, D = o.depth * S, zb = 0;
    const mat = new THREE.LineBasicMaterial({ color: '#c2410c' });
    const seg = (a: number[], b: number[]) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]); this.dimsGroup.add(new THREE.Line(g, mat)); };
    const yb = -0.0 + 0.002; seg([0, yb, z1], [W, yb, z1]); seg([0, yb, z1 - 0.02], [0, yb, z1 + 0.02]); seg([W, yb, z1 - 0.02], [W, yb, z1 + 0.02]);
    this.dimsGroup.add(this.label(`${o.width}`, new THREE.Vector3(W / 2, yb + 0.03, z1)));
    seg([W + 0.05, 0, z1 - 0.02], [W + 0.05, H, z1 - 0.02]); this.dimsGroup.add(this.label(`${o.height}`, new THREE.Vector3(W + 0.05, H / 2, z1)));
    seg([W + 0.05, H + 0.01, zb], [W + 0.05, H + 0.01, zb + D]); this.dimsGroup.add(this.label(`${o.depth}`, new THREE.Vector3(W + 0.05, H + 0.05, zb + D / 2)));
    this.dimsGroup.visible = this.opts.dims;
  }
  private idle = 0;
  /** Рендер по требованию: цикл крутится, пока идёт анимация или вращение, затем останавливается (экономит батарею). */
  kick() { this.idle = 0; if (!this.raf) { const loop = () => { this.tick(); if (this.idle > 30) { this.raf = 0; return; } this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); } }
  tick() {
    const before = JSON.stringify(this.anim); this.controls.update(); this.applyPose(false); this.renderer.render(this.scene, this.camera);
    const t = { door: this.opts.doors ? 1 : 0, drawer: this.opts.drawers ? 1 : 0, explode: this.opts.exploded ? 1 : 0, fade: this.opts.interior ? 0 : 1 };
    const settled = (Object.keys(t) as (keyof typeof t)[]).every(k => Math.abs(this.anim[k] - t[k]) < 0.002);
    if (settled && before === JSON.stringify(this.anim)) this.idle++; else this.idle = 0;
  }
  /** Снимок для документов и инструкции: показать только detail-ids, выделить hl. */
  snapshot(o: { show?: string[]; hl?: string[]; view?: 'iso' | 'front' | 'side' | 'top'; exploded?: boolean; dims?: boolean; w?: number; h?: number; interior?: boolean }): string {
    const prev = { ...this.opts }, vis = new Map<string, boolean>();
    this.setOpts({ exploded: !!o.exploded, dims: !!o.dims, doors: false, drawers: false, interior: !!o.interior }); this.applyPose(true);
    for (const [id, mesh] of this.meshes) {
      vis.set(id, mesh.visible);
      if (o.show) mesh.visible = o.show.includes(id) && mesh.visible;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (o.hl) { mat.emissive?.set(o.hl.includes(id) ? '#ff7a1a' : '#000'); mat.emissiveIntensity = o.hl.includes(id) ? 0.55 : 0; }
    }
    for (const ch of this.root.children) if (ch.userData.ghost) ch.visible = !o.show;
    if (o.w && o.h) { this.renderer.setSize(o.w, o.h, false); this.camera.aspect = o.w / o.h; this.camera.updateProjectionMatrix(); }
    this.view(o.view || 'iso'); this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    for (const [id, mesh] of this.meshes) mesh.visible = vis.get(id)!;
    for (const ch of this.root.children) if (ch.userData.ghost) ch.visible = true;
    this.setOpts(prev); this.applyPose(true); this.highlight();
    return url;
  }
}
