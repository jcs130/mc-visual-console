package org.mcvisual.observer;

import com.google.gson.*;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Read-only observer protocol. A dimension label is never a player/world identity. */
public final class ObserverState {
    public static final int MAX_BYTES = 65_536;
    public static final long STALE_NS = 12_000_000_000L;
    private static final String UUID_PATTERN = "[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}";
    public record Camera(String recipient, String player, int entity, Object world, boolean observer) {}
    public record Snapshot(JsonObject data, Camera camera, long receivedNs, long epoch) {}
    private Camera camera;
    private Snapshot snapshot;
    private long epoch, accepted, rejected;
    private String reason = "not_connected";

    public synchronized void camera(Camera next) {
        if (!sameCamera(camera, next)) {
            epoch++; snapshot = null;
            reason = next == null || !next.observer ? "not_attached" : "awaiting_target_state";
        }
        camera = next;
    }
    public synchronized void clear(String why) { camera = null; snapshot = null; epoch++; reason = why; }
    public synchronized Snapshot current(long now) {
        if (snapshot != null && (now < snapshot.receivedNs || now - snapshot.receivedNs > STALE_NS)) {
            snapshot = null; epoch++; reason = "state_expired";
        }
        return snapshot;
    }
    public synchronized boolean accept(byte[] bytes, long now) {
        try {
            JsonObject root = parse(bytes);
            if (!integer(root.get("schemaVersion"), 1, 1)) return reject("unsupported_schema");
            JsonObject session = object(root.get("viewerSession"));
            if (session == null || !uuid(string(session.get("recipientUuid")))) return reject("invalid_session");
            if (camera == null || !equalId(camera.recipient, string(session.get("recipientUuid")))) return reject("wrong_recipient");
            String mode = string(session.get("mode"));
            if (!"observer".equals(mode) && !"self".equals(mode)) return reject("invalid_mode");
            if (!(session.get("attached") instanceof JsonPrimitive attached && attached.isBoolean())) return reject("invalid_attached");
            if (!bool(session.get("attached"))) {
                // A self observation is not a detached observer notice.
                if (!"observer".equals(mode)) return reject("invalid_detach");
                snapshot = null; epoch++; reason = "server_detached"; accepted++; return true;
            }
            if (!"observer".equals(mode) || !camera.observer) return reject("not_observing");
            String subject = string(session.get("playerUuid"));
            if (!uuid(subject) || !uuid(string(session.get("worldUuid")))
                    || !integer(session.get("entityId"), 0, Integer.MAX_VALUE)
                    || !(session.get("windowOpen") instanceof JsonPrimitive p && p.isBoolean())) return reject("invalid_subject");
            if (!subject.equalsIgnoreCase(camera.player) || session.get("entityId").getAsInt() != camera.entity)
                return reject("wrong_camera_subject");
            if (root.has("playerUuid") && !equalId(subject,string(root.get("playerUuid")))) return reject("wrong_root_subject");
            JsonObject rpg = object(root.get("rpg"));
            if (rpg != null && rpg.has("playerUuid") && !equalId(subject,string(rpg.get("playerUuid")))) return reject("wrong_rpg_subject");
            String name = string(session.get("playerName"));
            if (name == null || !name.matches("[A-Za-z0-9_.]{1,32}")) return reject("invalid_subject_name");
            JsonObject vitals = object(root.get("vitals"));
            if (vitals == null || !range(vitals.get("health"), 0, 1024) || !range(vitals.get("maxHealth"), 1, 1024)
                    || vitals.get("health").getAsDouble() > vitals.get("maxHealth").getAsDouble()) return reject("invalid_vitals");
            for (var rule : Map.of("food",20.0,"armor",1024.0,"oxygen",20.0,"absorption",1024.0,
                    "experienceLevel",2147483647.0,"experienceProgress",1.0,"quickBarSlot",8.0).entrySet())
                if (vitals.has(rule.getKey()) && !vitals.get(rule.getKey()).isJsonNull()
                        && !range(vitals.get(rule.getKey()),0,rule.getValue())) return reject("invalid_"+rule.getKey());
            JsonObject mana=object(root.get("mana"));
            if(mana!=null&&(!range(mana.get("current"),0,1e6)||!range(mana.get("max"),1,1e6)
                    ||mana.get("current").getAsDouble()>mana.get("max").getAsDouble()))return reject("invalid_mana");
            for (String array : List.of("skills", "abilities")) {
                if (root.has(array) && !(root.get(array) instanceof JsonArray)) return reject("invalid_" + array);
                JsonArray rows = root.has(array) ? root.getAsJsonArray(array) : new JsonArray();
                if (rows.size() > 128) return reject("too_many_" + array);
                for (JsonElement value : rows) if (!(value instanceof JsonObject row)
                        || string(row.get("id")) == null || !row.get("id").getAsString().matches("[a-z0-9_:.-]{1,80}"))
                    return reject("invalid_" + array + "_row");
            }
            snapshot = new Snapshot(root, camera, now, epoch); accepted++; reason = "attached"; return true;
        } catch (Exception failure) { return reject("malformed_payload"); }
    }
    private boolean reject(String why) { rejected++; reason = why; return false; }
    public synchronized long epoch() { return epoch; }
    public synchronized Map<String,Object> diagnostics(long now) {
        Snapshot s = current(now);
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("schema", "mcvisual-native-observer/v1"); m.put("accepted", accepted); m.put("rejected", rejected);
        m.put("status", reason); m.put("epoch", epoch); m.put("attached", s != null);
        m.put("playerUuid", s == null ? null : s.camera.player); m.put("entityId", s == null ? null : s.camera.entity);
        m.put("ageMs", s == null ? null : (now - s.receivedNs)/1_000_000);
        m.put("serverObservedAt", null); m.put("ordering", "native_camera_uuid_entity_and_connection_epoch");
        return m;
    }
    private static boolean sameCamera(Camera a, Camera b) {
        return a == b || a != null && b != null && a.world == b.world && a.entity == b.entity && a.observer == b.observer
                && Objects.equals(a.recipient, b.recipient) && Objects.equals(a.player, b.player);
    }
    public static JsonObject object(JsonElement e) { return e instanceof JsonObject o ? o : null; }
    public static String string(JsonElement e) { return e instanceof JsonPrimitive p && p.isString() ? p.getAsString() : null; }
    public static boolean bool(JsonElement e) { return e instanceof JsonPrimitive p && p.isBoolean() && p.getAsBoolean(); }
    public static boolean range(JsonElement e, double min, double max) {
        if (!(e instanceof JsonPrimitive p) || !p.isNumber()) return false;
        double n = p.getAsDouble(); return Double.isFinite(n) && n >= min && n <= max;
    }
    private static boolean integer(JsonElement e, int min, int max) {
        return range(e, min, max) && e.getAsDouble() == Math.rint(e.getAsDouble());
    }
    private static boolean uuid(String value) { return value != null && value.matches(UUID_PATTERN); }
    private static boolean equalId(String a, String b) { return a != null && b != null && a.equalsIgnoreCase(b); }

    /** Preserve all bounded fields, including extensions. Duplicate keys and invalid UTF-8 are rejected. */
    public static JsonObject parse(byte[] bytes) throws Exception {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("payload_size");
        String source = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        JsonReader reader = new JsonReader(new StringReader(source)); reader.setLenient(false);
        JsonElement root = read(reader, 0, new int[]{0});
        if (!(root instanceof JsonObject result) || reader.peek() != JsonToken.END_DOCUMENT) throw new IllegalArgumentException("root");
        return result;
    }
    private static JsonElement read(JsonReader in, int depth, int[] count) throws Exception {
        if (depth > 20 || ++count[0] > 4096) throw new IllegalArgumentException("structure_limit");
        return switch (in.peek()) {
            case BEGIN_OBJECT -> {
                in.beginObject(); JsonObject o = new JsonObject(); int size = 0;
                while (in.hasNext()) {
                    String key = in.nextName();
                    if (++size > 256 || key.length() > 128 || o.has(key)) throw new IllegalArgumentException("object_limit_or_duplicate");
                    o.add(key, read(in, depth + 1, count));
                }
                in.endObject(); yield o;
            }
            case BEGIN_ARRAY -> {
                in.beginArray(); JsonArray a = new JsonArray();
                while (in.hasNext()) { if (a.size() >= 256) throw new IllegalArgumentException("array_limit"); a.add(read(in, depth + 1, count)); }
                in.endArray(); yield a;
            }
            case STRING -> { String s = in.nextString(); if (s.length() > 4096) throw new IllegalArgumentException("string_limit"); yield new JsonPrimitive(s); }
            case NUMBER -> { var n = new java.math.BigDecimal(in.nextString()); if (!Double.isFinite(n.doubleValue())) throw new IllegalArgumentException("number_limit"); yield new JsonPrimitive(n); }
            case BOOLEAN -> new JsonPrimitive(in.nextBoolean());
            case NULL -> { in.nextNull(); yield JsonNull.INSTANCE; }
            default -> throw new IllegalArgumentException("invalid_json");
        };
    }
}
