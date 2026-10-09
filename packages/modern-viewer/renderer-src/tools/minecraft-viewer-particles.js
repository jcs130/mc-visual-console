/** Shared Three.js layer for bounded 1.20.6 particles, explosions and world events. */
const cortiVisualParticles = [];
const cortiVisualRings = [];
let cortiParticleScene = null;
let cortiParticleCloud = null;
let cortiParticlePositions = null;
let cortiParticleColors = null;
let cortiParticleOpacity = null;
let cortiParticleLastAt = performance.now();

function cortiParticleColor(name, explicit) {
  const three = globalThis.THREE;
  if (explicit) return new three.Color(explicit[0], explicit[1], explicit[2]);
  const category = /flame|fire|lava|explosion|gust/.test(name) ? 'fire'
    : /portal|enchant|witch|dragon|sculk|soul|omen/.test(name) ? 'arcane'
      : /heart|happy|totem|heal|composter|bone|life|pickup/.test(name) ? 'life'
        : /water|bubble|splash|snow|frost|rain/.test(name) ? 'water'
          : /crit|damage|sweep|electric|flash/.test(name) ? 'combat' : 'neutral';
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--corti-vfx-${category}`).trim();
  return new three.Color(value || ({ fire: '#ffa05b', arcane: '#c5a5ff', life: '#a9eeb8',
    water: '#a6e5ff', combat: '#fff4af', neutral: '#d9e0d7' })[category]);
}

function cortiEnsureParticleScene() {
  const three = globalThis.THREE;
  const scene = globalThis.world?.scene;
  if (!three || !scene) return false;
  if (cortiParticleScene === scene && cortiParticleCloud) return true;
  cortiParticleCloud?.parent?.remove(cortiParticleCloud);
  cortiParticleCloud?.geometry?.dispose();
  cortiParticleCloud?.material?.dispose();
  for (const ring of cortiVisualRings) {
    ring.mesh.parent?.remove(ring.mesh);
    ring.mesh.geometry.dispose(); ring.mesh.material.dispose();
  }
  cortiVisualRings.length = 0;
  cortiVisualParticles.length = 0;
  cortiParticlePositions = new Float32Array(480 * 3);
  cortiParticleColors = new Float32Array(480 * 3);
  cortiParticleOpacity = new Float32Array(480);
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(cortiParticlePositions, 3));
  geometry.setAttribute('color', new three.BufferAttribute(cortiParticleColors, 3));
  geometry.setAttribute('opacity', new three.BufferAttribute(cortiParticleOpacity, 1));
  geometry.setDrawRange(0, 0);
  const material = new three.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: three.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float opacity; varying vec3 vColor; varying float vOpacity;
      void main(){vColor=color;vOpacity=opacity;vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=clamp(70.0/max(1.0,-mv.z),2.0,28.0);gl_Position=projectionMatrix*mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      varying vec3 vColor;varying float vOpacity;
      void main(){
      #include <logdepthbuf_fragment>
      float d=length(gl_PointCoord*2.0-1.0);float a=1.0-smoothstep(0.30,1.0,d);
      gl_FragColor=vec4(vColor,a*vOpacity);}`,
  });
  cortiParticleCloud = new three.Points(geometry, material);
  cortiParticleCloud.name = 'corti-server-particles';
  scene.add(cortiParticleCloud);
  cortiParticleScene = scene;
  return true;
}

function cortiSpawnParticleBurst(event) {
  if (!cortiEnsureParticleScene()) return;
  const focus = pendingAvatarState?.entity?.pos || latestPosition?.pos;
  const pos = event.position;
  if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite) ||
      focus && Math.hypot(pos.x - focus.x, pos.y - focus.y, pos.z - focus.z) > 80) return;
  const name = String(event.name || event.kind || 'neutral');
  const color = cortiParticleColor(name, event.color);
  const count = Math.min(48, Math.max(1, Number(event.count) || 1));
  const spread = event.spread || { x: .12, y: .12, z: .12 };
  const speed = Math.min(3, Math.max(.03, Number(event.speed) || .12));
  const gravity = /splash|water|rain|block|dust|explosion/.test(name) ? -.7 :
    /flame|soul|heart|enchant|portal/.test(name) ? .2 : 0;
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const direction = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 };
    cortiVisualParticles.push({
      pos: { x: pos.x + direction.x * Math.min(8, spread.x || 0),
        y: pos.y + direction.y * Math.min(8, spread.y || 0),
        z: pos.z + direction.z * Math.min(8, spread.z || 0) },
      vel: { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed },
      gravity, color, born: now, ttl: /explosion|firework|flash/.test(name) ? 850 : 1250,
    });
  }
  if (cortiVisualParticles.length > 480)
    cortiVisualParticles.splice(0, cortiVisualParticles.length - 480);
}

function cortiSpawnExplosion(event) {
  if (!cortiEnsureParticleScene()) return;
  const three = globalThis.THREE;
  const radius = Math.min(12, Math.max(.5, Number(event.radius) || 1));
  const material = new three.MeshBasicMaterial({ color: cortiParticleColor('explosion'),
    transparent: true, opacity: .65, side: three.DoubleSide, depthWrite: false,
    blending: three.AdditiveBlending, toneMapped: false });
  const mesh = new three.Mesh(new three.TorusGeometry(1, .045, 6, 48), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.name = 'corti-server-explosion';
  cortiParticleScene.add(mesh);
  cortiVisualRings.push({ mesh, position: event.position, radius, born: performance.now() });
  while (cortiVisualRings.length > 16) {
    const old = cortiVisualRings.shift();
    old.mesh.parent?.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose();
  }
  cortiSpawnParticleBurst({ kind: 'particle', name: 'explosion', position: event.position,
    spread: { x: radius * .5, y: radius * .5, z: radius * .5 }, speed: radius * .4, count: 40 });
}

function cortiAnimateServerParticles(now) {
  const delta = Math.min(.05, Math.max(0, (now - cortiParticleLastAt) / 1000));
  cortiParticleLastAt = now;
  const origin = globalThis.world?.sceneOrigin;
  if (origin && cortiEnsureParticleScene()) {
    let write = 0;
    for (let i = 0; i < cortiVisualParticles.length; i++) {
      const part = cortiVisualParticles[i];
      const life = (now - part.born) / part.ttl;
      if (life >= 1) continue;
      part.pos.x += part.vel.x * delta; part.pos.y += part.vel.y * delta;
      part.pos.z += part.vel.z * delta; part.vel.y += part.gravity * delta;
      cortiParticlePositions.set([origin.toSceneX(part.pos.x), origin.toSceneY(part.pos.y),
        origin.toSceneZ(part.pos.z)], write * 3);
      cortiParticleColors.set([part.color.r, part.color.g, part.color.b], write * 3);
      cortiParticleOpacity[write] = Math.min(1, (1 - life) * 1.3);
      cortiVisualParticles[write++] = part;
    }
    cortiVisualParticles.length = write;
    const geometry = cortiParticleCloud.geometry;
    geometry.setDrawRange(0, write);
    for (const key of ['position', 'color', 'opacity']) geometry.attributes[key].needsUpdate = true;
    for (let i = cortiVisualRings.length - 1; i >= 0; i--) {
      const ring = cortiVisualRings[i];
      const progress = (now - ring.born) / 550;
      if (progress >= 1) {
        ring.mesh.parent?.remove(ring.mesh); ring.mesh.geometry.dispose(); ring.mesh.material.dispose();
        cortiVisualRings.splice(i, 1); continue;
      }
      ring.mesh.position.set(origin.toSceneX(ring.position.x),
        origin.toSceneY(ring.position.y + .1), origin.toSceneZ(ring.position.z));
      ring.mesh.scale.setScalar((.2 + progress) * ring.radius);
      ring.mesh.material.opacity = .65 * (1 - progress);
    }
  }
  requestAnimationFrame(cortiAnimateServerParticles);
}

if (typeof socket !== 'undefined') socket.on('presentationEvent', event => {
  if (!event || typeof event.kind !== 'string') return;
  if (event.kind === 'particle') cortiSpawnParticleBurst(event);
  else if (event.kind === 'explosion') cortiSpawnExplosion(event);
  else if (event.kind === 'world_event') {
    const name = ({ 2001: 'block', 2002: 'splash', 2003: 'portal', 2005: 'bone',
      3000: 'portal', 3001: 'dragon' })[event.effectId] || 'neutral';
    cortiSpawnParticleBurst({ name, position: event.position,
      spread: { x: .4, y: .4, z: .4 }, speed: .24, count: name === 'neutral' ? 5 : 18 });
  } else if (event.position && ['skill', 'quest', 'achievement', 'effect'].includes(event.kind)) {
    cortiSpawnParticleBurst({ name: event.kind === 'skill' ? 'arcane' : event.kind === 'effect' ? event.name : 'life',
      position: event.position, spread: { x: .7, y: .5, z: .7 }, speed: .25, count: 22 });
  } else if (event.kind === 'pickup' && event.position) {
    cortiSpawnParticleBurst({ name: 'life', position: event.position,
      spread: { x: .18, y: .18, z: .18 }, speed: .18, count: Math.min(12, 3 + Number(event.count || 1)) });
    if (event.to) cortiSpawnParticleBurst({ name: 'life', position: event.to,
      spread: { x: .15, y: .15, z: .15 }, speed: .12, count: 4 });
  }
});
requestAnimationFrame(cortiAnimateServerParticles);
