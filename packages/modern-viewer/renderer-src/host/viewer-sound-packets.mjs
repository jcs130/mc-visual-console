const categories = ['master', 'music', 'records', 'weather', 'blocks', 'hostile', 'neutral', 'players', 'ambient', 'voice'];
const categoryAliases = { record: 'records', block: 'blocks', player: 'players' };
const category = (value) => {
    if (typeof value === 'number' && Number.isInteger(value))
        return categories[value];
    if (typeof value === 'string') {
        const name = categoryAliases[value] ?? value;
        if (categories.includes(name))
            return name;
    }
    return undefined;
};
const name = (value) => {
    if (typeof value !== 'string' || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]{1,160}$/.test(value))
        return undefined;
    if (value.split('/').some(part => part === '.' || part === '..'))
        return undefined;
    return value.replace(/^minecraft:/, '');
};
const record = (value) => value && typeof value === 'object' ? value : null;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const position = (value, scale = 1) => {
    const p = record(value);
    return p && [p.x, p.y, p.z].every(finite)
        ? { x: Number(p.x) / scale, y: Number(p.y) / scale, z: Number(p.z) / scale } : null;
};
const seed = (value) => {
    if (typeof value === 'bigint')
        return value.toString();
    if (typeof value === 'number' && Number.isSafeInteger(value))
        return String(value);
    if (typeof value === 'string' && /^-?\d{1,20}$/.test(value))
        return value;
    if (Array.isArray(value) && value.length === 2 && value.every(part => Number.isInteger(part)))
        return BigInt.asIntN(64, (BigInt(value[0]) << 32n) | BigInt(Number(value[1]) >>> 0)).toString();
    return undefined;
};
export function viewerSoundPacket(kind, value, registry, entityPosition) {
    const packet = record(value);
    if (!packet || !finite(packet.volume) || !finite(packet.pitch))
        return null;
    const holder = record(packet.sound);
    const inline = record(holder?.data);
    const id = holder?.soundId ?? packet.soundId;
    const soundName = name(packet.soundName ?? inline?.soundName ??
        (Number.isSafeInteger(id) ? registry.sounds?.[Number(id)]?.name : undefined));
    if (!soundName)
        return null;
    let pos;
    let entityId;
    if (kind === 'entity_sound_effect') {
        if (!Number.isSafeInteger(packet.entityId) || Number(packet.entityId) < 0)
            return null;
        entityId = Number(packet.entityId);
        pos = position(entityPosition(entityId));
        // An unknown entity has no safe spatial origin for a positional sound.
        if (!pos)
            return null;
    }
    else if (kind === 'sound_effect' || kind === 'named_sound_effect') {
        pos = position(packet, 8);
        if (!pos)
            return null;
    }
    else
        return null;
    const source = category(packet.soundCategory);
    const randomSeed = seed(packet.seed);
    return { name: soundName, position: pos, volume: Math.max(0, Math.min(16, packet.volume)),
        pitch: Math.max(.01, Math.min(4, packet.pitch)),
        ...(source ? { category: source } : {}), ...(entityId !== undefined ? { entityId } : {}),
        ...(randomSeed !== undefined ? { seed: randomSeed } : {}),
        ...(finite(inline?.fixedRange) && inline.fixedRange > 0 && inline.fixedRange <= 1024
            ? { fixedRange: inline.fixedRange } : {}) };
}
export function viewerSoundStopPacket(value) {
    const packet = record(value);
    if (!packet || !Number.isInteger(packet.flags) || Number(packet.flags) < 0 || Number(packet.flags) > 3)
        return null;
    const flags = Number(packet.flags);
    const source = flags & 1 ? category(packet.source) : undefined;
    const soundName = flags & 2 ? name(packet.sound) : undefined;
    if (((flags & 1) && !source) || ((flags & 2) && !soundName))
        return null;
    return { ...(source ? { category: source } : {}), ...(soundName ? { name: soundName } : {}) };
}
export function observeViewerSounds(protocol, registry, entityPosition, publish, stop, now = Date.now) {
    let windowAt = now();
    let count = 0;
    const listeners = ['sound_effect', 'named_sound_effect', 'entity_sound_effect'].map(kind => {
        const listener = (packet) => {
            const event = viewerSoundPacket(kind, packet, registry, entityPosition);
            if (!event)
                return;
            const at = now();
            if (at - windowAt >= 1000) {
                windowAt = at;
                count = 0;
            }
            if (++count <= 128)
                publish(event);
        };
        protocol.on(kind, listener);
        return { kind, listener };
    });
    const stopped = (packet) => { const event = viewerSoundStopPacket(packet); if (event)
        stop(event); };
    protocol.on('stop_sound', stopped);
    return () => {
        for (const { kind, listener } of listeners)
            protocol.off(kind, listener);
        protocol.off('stop_sound', stopped);
    };
}
