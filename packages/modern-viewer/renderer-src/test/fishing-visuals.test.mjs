import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Scene } from "three";
import { FishingVisuals, matchFishingOwners, withSelfFishingActor } from "../src/modern-viewer/fishing-visuals.js";

const actor = (id, x, item = "fishing_rod") => ({
  id, name: "player", pos: { x, y: 64, z: 0 }, yaw: 0,
  equipment: [{ name: item }],
});
const bobber = (id, x) => ({ id, name: "fishing_bobber", pos: { x, y: 63, z: 4 } });

test("fishing lines follow rod holders and keep their owner when anglers cross", () => {
  const hook = bobber(90, 3);
  assert.equal(matchFishingOwners([hook], [actor(1, 0), actor(2, 15)]).get("90").id, 1);
  assert.equal(matchFishingOwners([hook], [actor(1, 15), actor(2, 0)], new Map([["90", "1"]])).get("90").id, 1);
  assert.equal(matchFishingOwners([hook], [actor(1, 0, "sword")]).size, 0);
  assert.equal(matchFishingOwners([bobber(91, 60)], [actor(1, 0)]).size, 0);
  assert.equal(matchFishingOwners([{ ...hook, ownerEntityId: 2 }], [actor(1, 0), actor(2, 15)]).get("90").id, 2);
  assert.equal(matchFishingOwners([{ ...hook, ownerEntityId: 3 }], [actor(1, 0), actor(2, 15)]).size, 0);
  const twoLines = matchFishingOwners([bobber(91, 2), { ...hook, ownerEntityId: 1 }],
    [actor(1, 0), actor(2, 8)]);
  assert.equal(twoLines.get("90").id, 1);
  assert.equal(twoLines.get("91").id, 2);
  assert.equal(matchFishingOwners([bobber(91, 2), bobber(92, 3)], [actor(1, 0)]).size, 1);
});

test("selected hotbar rod takes precedence over a stale avatar equipment snapshot", () => {
  const self = actor(1, 0);
  const actors = withSelfFishingActor([actor(1, 0, "sword")], {
    entity: self,
    equipment: [{ name: "sword" }],
  });
  assert.equal(actors.length, 1);
  assert.equal(matchFishingOwners([bobber(90, 2)], actors).get("90").id, 1);
});

test("bobber spawn and removal attach and dispose fishing visuals", () => {
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const scene = new Scene();
    const world = { scene, sceneOrigin: {
      x: 0, y: 0, z: 0,
      addAndTrack(root) { scene.add(root); },
      removeAndUntrack(root) { root.removeFromParent(); },
      toSceneX(x) { return x; }, toSceneY(y) { return y; }, toSceneZ(z) { return z; },
    } };
    const actions = [];
    const visuals = new FishingVisuals({
      getWorld: () => world,
      getCamera: () => new PerspectiveCamera(),
      getActors: () => [actor(1, 0)],
      getSelfId: () => 1,
      firstPerson: false,
      onAction: (phase) => actions.push(phase),
    });
    visuals.updateEntity(bobber(90, 3));
    assert.equal(visuals.visuals.size, 1);
    assert.equal(scene.children.length, 2);
    visuals.tick(1000);
    assert.equal(visuals.visuals.get("90").lineGeometry.getAttribute("position").count, 15);
    visuals.updateEntity({ id: 90, delete: true });
    assert.equal(visuals.visuals.size, 0);
    assert.equal(scene.children.length, 0);
    assert.deepEqual(actions, ["cast", "reel"]);
    visuals.dispose();
  } finally {
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("historical bobbers and reused entity IDs do not trigger fishing actions", () => {
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const scene = new Scene();
    const origin = {
      addAndTrack(root) { scene.add(root); },
      removeAndUntrack(root) { root.removeFromParent(); },
      toSceneX(x) { return x; }, toSceneY(y) { return y; }, toSceneZ(z) { return z; },
    };
    const actions = [];
    const visuals = new FishingVisuals({
      getWorld: () => ({ scene, sceneOrigin: origin }),
      getCamera: () => new PerspectiveCamera(),
      getActors: () => [actor(1, 0)],
      getSelfId: () => 1,
      firstPerson: false,
      onAction: (phase) => actions.push(phase),
    });
    visuals.updateEntity(bobber(90, 3), { historical: true });
    assert.equal(visuals.visuals.size, 1);
    assert.deepEqual(actions, []);
    visuals.updateEntity({ id: 90, name: "zombie", pos: { x: 3, y: 63, z: 4 } });
    assert.equal(visuals.visuals.size, 0);
    assert.equal(visuals.bobbers.size, 0);
    assert.equal(scene.children.length, 0);
    assert.deepEqual(actions, []);
    visuals.dispose();
  } finally {
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});
