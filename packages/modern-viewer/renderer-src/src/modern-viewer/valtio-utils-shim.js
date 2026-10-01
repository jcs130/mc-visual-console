import { subscribe } from "valtio/vanilla";

export function subscribeKey(proxyObject, key, callback, notifyInSync) {
  let previous = proxyObject[key];
  return subscribe(
    proxyObject,
    () => {
      const next = proxyObject[key];
      if (Object.is(previous, next)) return;
      previous = next;
      callback(next);
    },
    notifyInSync,
  );
}
