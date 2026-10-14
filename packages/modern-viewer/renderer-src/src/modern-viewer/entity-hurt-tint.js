const states = new WeakMap();

/** One temporary tint per mesh, restored to the untinted original even when
 * damage events overlap. Shared materials and nametags are never modified. */
export function tintEntityDamage(root, Tween) {
  root?.traverse(child => {
    if (!child.isMesh || !child.material?.color?.clone || !child.material?.clone) return;
    let state = states.get(child);
    if (state && child.material !== state.tinted) {
      state.tween?.stop(); state.tinted.dispose(); states.delete(child); state = null;
    }
    if (!state) {
      state = { original: child.material, tinted: child.material.clone() };
      states.set(child, state); child.material = state.tinted;
    }
    state.tween?.stop();
    state.tinted.color.set(0xff0000);
    const target = state.original.color.clone();
    state.tween = new Tween(state.tinted.color).to(target, 500).onComplete(() => {
      if (states.get(child) !== state) return;
      if (child.material === state.tinted) child.material = state.original;
      state.tinted.dispose(); states.delete(child);
    }).start();
  });
}
