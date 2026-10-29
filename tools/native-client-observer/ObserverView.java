package org.mcvisual.observer;

import com.google.gson.*;
import java.util.*;

/** Display projections only. No inferred balances, skill unlocks or success judgments. */
public final class ObserverView {
    private ObserverView() {}
    private static JsonElement at(JsonObject o, String... path) {
        JsonElement v = o;
        for (String key : path) { if (!(v instanceof JsonObject obj)) return JsonNull.INSTANCE; v = obj.get(key); }
        return v == null ? JsonNull.INSTANCE : v;
    }
    public static String text(JsonElement v) { String s = ObserverState.string(v); return s == null ? "?" : s; }
    public static String num(JsonElement v) {
        if (!ObserverState.range(v, 0, 1e15)) return "?";
        return java.math.BigDecimal.valueOf(v.getAsDouble()).stripTrailingZeros().toPlainString();
    }
    public static List<String> overview(JsonObject d, boolean zh) {
        List<String> rows = new ArrayList<>();
        rows.add((zh ? "观战 · " : "Following · ") + text(at(d,"viewerSession","playerName")));
        rows.add((zh ? "生命 " : "HP ") + num(at(d,"vitals","health")) + "/" + num(at(d,"vitals","maxHealth"))
                + (zh ? "  护甲 " : "  Armor ") + num(at(d,"vitals","armor")));
        rows.add((zh ? "饥饿 " : "Food ") + num(at(d,"vitals","food")) + "/20"
                + (zh ? "  原版经验 Lv." : "  Vanilla XP Lv.") + num(at(d,"vitals","experienceLevel")));
        rows.add((zh ? "魔力 " : "MP ") + num(at(d,"mana","current")) + "/" + num(at(d,"mana","max")));
        JsonObject r = ObserverState.object(d.get("rpg"));
        if (r != null && ObserverState.bool(r.get("available"))) {
            JsonElement label = at(r,"className"); if (ObserverState.string(label) == null) label = at(r,"combat");
            rows.add((zh ? "职业 " : "Class ") + text(label) + "  RPG Lv." + num(at(r,"level")));
            rows.add("RPG XP " + num(at(r,"xp")) + (zh ? "  距下级 " : "  XP remaining ")
                    + num(r.has("xpToNextLevel") ? r.get("xpToNextLevel") : r.get("nextLevelXp")));
            rows.add((zh ? "学习点 " : "Skill points ") + num(at(r,"skillPoints"))
                    + (zh ? "  金币 " : "  Balance ") + (ObserverState.bool(at(r,"economy","available")) ? num(at(r,"economy","balance")) : "?"));
        } else rows.add(zh ? "职业信息未同步" : "Profession data unavailable");
        rows.add((zh ? "原生目标背包 · F9详情 / F10翻页" : "Native inventory · F9 details / F10 page"));
        return rows;
    }
    public static List<String> abilities(JsonObject d, boolean zh) {
        List<String> rows = new ArrayList<>(); rows.add(zh ? "观战对象 · 技能最近观测" : "Target · Latest skill readings");
        JsonArray a = d.get("abilities") instanceof JsonArray x ? x : new JsonArray();
        for (JsonElement e : a) if (e instanceof JsonObject v) {
            String label = ObserverState.string(v.get("name")); if (label == null) label = text(v.get("id"));
            JsonElement remaining = v.has("cooldownRemainingMs") ? v.get("cooldownRemainingMs")
                    : d.has("rpg") ? JsonNull.INSTANCE : v.get("cooldownMs");
            String cooldown = ObserverState.range(remaining,0,86_400_000)
                    ? String.format(Locale.ROOT,"%.1fs",remaining.getAsDouble()/1000) : "?";
            rows.add(label + " [" + text(v.get("id")) + "]");
            rows.add("  MP " + num(v.get("manaCost")) + (zh ? "  剩余冷却 " : "  Cooldown remaining ") + cooldown);
        }
        if (a.isEmpty()) rows.add(zh ? "尚无技能列表；不代表没有技能" : "No skill list received; availability unknown");
        JsonArray skills = d.get("skills") instanceof JsonArray x ? x : new JsonArray();
        for (JsonElement e : skills) if (e instanceof JsonObject v)
            rows.add(text(v.get("name")) + " Lv." + num(v.get("level")) + " XP " + num(v.get("xp")) + "/" + num(v.get("requiredXp")));
        return rows;
    }
    /** Every received field remains inspectable; no arbitrary JSON is copied to logs or a network listener. */
    public static List<String> fields(JsonObject data) {
        List<String> rows = new ArrayList<>(); flatten("",data,rows); return rows;
    }
    private static void flatten(String path, JsonElement value, List<String> out) {
        if (value instanceof JsonObject o) {
            if (o.isEmpty()) out.add(path+" = {}");
            for (var e:o.entrySet()) flatten(path.isEmpty()?e.getKey():path+"."+e.getKey(),e.getValue(),out);
        } else if (value instanceof JsonArray a) {
            if (a.isEmpty()) out.add(path+" = []");
            for(int i=0;i<a.size();i++)flatten(path+"["+i+"]",a.get(i),out);
        } else out.add(path+" = "+(value == null || value.isJsonNull()?"?":value.getAsString()));
    }
}
