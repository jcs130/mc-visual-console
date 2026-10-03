import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";

const HOOK_NAME = "fishing_bobber";
const MAX_LINE_LENGTH = 35;
const LINE_SEGMENTS = 14;

const itemName = (item) => String(item?.name || "").replace(/^minecraft:/, "").toLowerCase();
const hasRod = (entity) => Array.isArray(entity?.equipment)
  && entity.equipment.slice(0, 2).some((item) => itemName(item) === "fishing_rod");
const positionOf = (entity) => entity?.pos || entity?.position;
const distanceSquared = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export function withSelfFishingActor(actors, state) {
  if (state?.entity?.id === undefined) return actors;
  const self = {
    ...state.entity,
    // The selected hotbar slot is serialized on entity. The separate avatar
    // equipment snapshot can lag behind a newly equipped fishing rod.
    equipment: Array.isArray(state.entity.equipment)
      ? state.entity.equipment : state.equipment,
  };
  const result = [...actors];
  const index = result.findIndex((actor) => String(actor.id) === String(self.id));
  if (index >= 0) result[index] = self;
  else result.push(self);
  return result;
}

// Stable association prevents nearby anglers' lines from swapping mid-cast.
export function matchFishingOwners(bobbers, actors, previousOwners = new Map()) {
  const candidates = actors.filter((actor) => hasRod(actor) && positionOf(actor));
  const matches = new Map();
  // Reserve known owners before guessing any legacy bobber. Packet order must
  // not allow an unknown bobber to claim a player with an explicit owner ID.
  const assigned = new Set(bobbers.map((bobber) => Number(bobber.ownerEntityId))
    .filter((ownerId) => Number.isInteger(ownerId) && ownerId > 0
      && candidates.some((actor) => Number(actor.id) === ownerId))
    .map(String));
  for (const bobber of bobbers) {
    const point = positionOf(bobber);
    if (!point) continue;
    const id = String(bobber.id);
    const ownerEntityId = Number(bobber.ownerEntityId);
    if (Number.isInteger(ownerEntityId) && ownerEntityId > 0) {
      const owner = candidates.find((actor) => Number(actor.id) === ownerEntityId);
      if (owner) { matches.set(id, owner); assigned.add(String(owner.id)); }
      // An explicit owner may be outside the loaded scene. Never connect its
      // line to a different angler just because they happen to stand nearby.
      continue;
    }
    const previousId = previousOwners.get(id);
    let owner = candidates.find((actor) => !assigned.has(String(actor.id)) && String(actor.id) === previousId
      && distanceSquared(positionOf(actor), point) <= MAX_LINE_LENGTH ** 2);
    if (!owner) {
      owner = candidates
        .filter((actor) => !assigned.has(String(actor.id))
          && distanceSquared(positionOf(actor), point) <= MAX_LINE_LENGTH ** 2)
        .sort((a, b) => distanceSquared(positionOf(a), point) - distanceSquared(positionOf(b), point))[0];
    }
    if (owner) { matches.set(id, owner); assigned.add(String(owner.id)); }
  }
  return matches;
}

function rodTip(actor, camera, origin, isFirstPerson) {
  if (isFirstPerson && camera) {
    const point = camera.getWorldPosition(new Vector3());
    const rotation = camera.getWorldQuaternion(camera.quaternion.clone());
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
    return point.add(forward.multiplyScalar(0.68)).add(right.multiplyScalar(0.40))
      .add(new Vector3(0, -0.27, 0))
      .add(new Vector3(origin.x, origin.y, origin.z));
  }
  const pos = positionOf(actor);
  const yaw = Number(actor.yaw) || 0;
  return new Vector3(
    pos.x + Math.cos(yaw) * 0.38 - Math.sin(yaw) * 0.25,
    pos.y + Math.max(0.6, (Number(actor.height) || 1.8) * 0.83),
    pos.z + Math.sin(yaw) * 0.38 + Math.cos(yaw) * 0.25,
  );
}

function makeFloat() {
  const root = new Group();
  root.name = "viewer-fishing-float";
  const white = new MeshBasicMaterial({ color: 0xf6f3df });
  const red = new MeshBasicMaterial({ color: 0xc94036 });
  const dark = new MeshBasicMaterial({ color: 0x31363a });
  const body = new Mesh(new BoxGeometry(0.20, 0.12, 0.20), white);
  const cap = new Mesh(new BoxGeometry(0.22, 0.08, 0.22), red);
  cap.position.y = 0.085;
  const stem = new Mesh(new CylinderGeometry(0.014, 0.014, 0.12, 6), dark);
  stem.position.y = 0.17;
  root.add(body, cap, stem);
  return { root, geometries: [body.geometry, cap.geometry, stem.geometry], materials: [white, red, dark] };
}

export class FishingVisuals {
  constructor({ getWorld, getCamera, getActors, getSelfId, firstPerson, onAction }) {
    this.getWorld = getWorld;
    this.getCamera = getCamera;
    this.getActors = getActors;
    this.getSelfId = getSelfId;
    this.firstPerson = firstPerson;
    this.onAction = onAction;
    this.bobbers = new Map();
    this.visuals = new Map();
    this.owners = new Map();
    this.historical = new Set();
    this.frame = null;
    this.disposed = false;
  }

  updateEntity(entity, { historical = false } = {}) {
    if (!entity || entity.id === undefined) return;
    const id = String(entity.id);
    if (entity.delete) {
      if (this.bobbers.has(id)) this.removeVisual(id, true);
      this.bobbers.delete(id);
      this.historical.delete(id);
      return;
    }
    if (String(entity.name || "").replace(/^minecraft:/, "") !== HOOK_NAME) {
      // Minecraft reuses runtime entity IDs. Discard the old float and owner
      // before an unrelated entity can inherit its line after reconnect.
      if (this.bobbers.has(id)) this.removeVisual(id, false);
      this.bobbers.delete(id);
      this.historical.delete(id);
      return;
    }
    if (!positionOf(entity)) return;
    if (historical) this.historical.add(id);
    this.bobbers.set(id, entity);
    this.sync();
  }

  sync() {
    if (this.disposed || !this.bobbers.size) return;
    const world = this.getWorld();
    if (!world?.sceneOrigin || !world.scene) return;
    const matches = matchFishingOwners([...this.bobbers.values()], this.getActors(), this.owners);
    for (const [id, owner] of matches) {
      this.owners.set(id, String(owner.id));
      if (this.visuals.has(id)) continue;
      const { root, geometries, materials } = makeFloat();
      const lineGeometry = new BufferGeometry();
      lineGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array((LINE_SEGMENTS + 1) * 3), 3));
      const lineMaterial = new LineBasicMaterial({ color: 0xf1eee1, transparent: true, opacity: 0.94, depthWrite: false });
      const line = new Line(lineGeometry, lineMaterial);
      line.name = "viewer-fishing-line";
      line.frustumCulled = false;
      world.sceneOrigin.addAndTrack(root);
      world.scene.add(line);
      this.visuals.set(id, { root, geometries, materials, line, lineGeometry, lineMaterial, createdAt: performance.now() });
      if (!this.historical.delete(id) && String(owner.id) === String(this.getSelfId())) this.onAction?.("cast");
    }
    if (this.visuals.size && this.frame === null) this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    this.frame = null;
    if (this.disposed) return;
    const world = this.getWorld();
    const origin = world?.sceneOrigin;
    if (!origin) return;
    const matches = matchFishingOwners([...this.bobbers.values()], this.getActors(), this.owners);
    for (const [id, visual] of this.visuals) {
      const bobber = this.bobbers.get(id);
      const owner = matches.get(id);
      if (!bobber || !owner) { this.removeVisual(id, false); continue; }
      const point = positionOf(bobber);
      const bob = Math.sin((now - visual.createdAt) * 0.004) * 0.016;
      const end = new Vector3(point.x, point.y + 0.20 + bob, point.z);
      visual.root.position.copy(end);
      const start = rodTip(owner, this.getCamera(), origin,
        this.firstPerson && String(owner.id) === String(this.getSelfId()));
      const array = visual.lineGeometry.getAttribute("position").array;
      for (let index = 0; index <= LINE_SEGMENTS; index += 1) {
        const t = index / LINE_SEGMENTS;
        const sag = Math.sin(Math.PI * t) * Math.min(0.45, Math.sqrt(distanceSquared(start, end)) * 0.045);
        const offset = index * 3;
        array[offset] = origin.toSceneX(start.x + (end.x - start.x) * t);
        array[offset + 1] = origin.toSceneY(start.y + (end.y - start.y) * t - sag);
        array[offset + 2] = origin.toSceneZ(start.z + (end.z - start.z) * t);
      }
      visual.lineGeometry.getAttribute("position").needsUpdate = true;
      visual.lineGeometry.computeBoundingSphere();
    }
    if (this.visuals.size) this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  removeVisual(id, reeled) {
    const visual = this.visuals.get(id);
    const ownerId = this.owners.get(id);
    this.visuals.delete(id);
    this.owners.delete(id);
    if (!visual) return;
    this.getWorld()?.sceneOrigin?.removeAndUntrack(visual.root);
    visual.line.removeFromParent();
    visual.geometries.forEach((geometry) => geometry.dispose());
    visual.materials.forEach((material) => material.dispose());
    visual.lineGeometry.dispose();
    visual.lineMaterial.dispose();
    // Entity removals also happen when the chunk unloads. Only a nearby
    // bobber disappearing can represent the player's reel action.
    const owner = this.getActors().find((actor) => String(actor.id) === ownerId);
    const bobber = this.bobbers.get(id);
    const nearby = owner && bobber && distanceSquared(positionOf(owner), positionOf(bobber)) <= MAX_LINE_LENGTH ** 2;
    if (reeled && nearby && ownerId === String(this.getSelfId())) this.onAction?.("reel");
  }

  dispose() {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    for (const id of this.visuals.keys()) this.removeVisual(id, false);
    this.bobbers.clear();
    this.historical.clear();
  }
}
