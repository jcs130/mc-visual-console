import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.mcvisual.observer.ObserverState;
import org.mcvisual.observer.ObserverView;
import org.mcvisual.observer.TargetInventory;
import org.mcvisual.observer.BossBarState;

public final class ObserverStateCheck {
    private static int checks;
    private static final String VIEWER="00000000-0000-0000-0000-000000000001";
    private static final String A="00000000-0000-0000-0000-000000000002", B="00000000-0000-0000-0000-000000000003";
    private static final Object WORLD=new Object();
    private static void check(boolean v,String label){checks++;if(!v)throw new AssertionError(label);}
    private static byte[] bytes(JsonObject o){return o.toString().getBytes(StandardCharsets.UTF_8);}
    private static JsonObject data(String uuid,int entity){
        return JsonParser.parseString("""
            {"schemaVersion":1,"viewerSession":{"mode":"observer","attached":true,
              "recipientUuid":"%s","playerUuid":"%s","playerName":"Player","worldUuid":"%s","entityId":%d,"windowOpen":false},
             "vitals":{"health":13,"maxHealth":30,"food":16,"armor":12,"experienceLevel":7,"experienceProgress":0.4,"quickBarSlot":2},
             "mana":{"current":31,"max":44},"skills":[],"abilities":[{"id":"mycli:mark","name":"Mark","manaCost":3,"cooldownMs":9000,"cooldownRemainingMs":null}],
             "rpg":{"available":true,"backend":"vortex","combat":"ranger","className":"Ranger","level":5,"xp":8743,"nextLevelXp":257,
                "skillPoints":3,"economy":{"available":false,"balance":9999},"party":{"available":true,"inParty":false,"members":[]}},
             "rescue":{"downed":false},"equipmentEffects":[{"id":"fixture:original","newField":true}]}
            """.formatted(VIEWER,uuid,VIEWER,entity)).getAsJsonObject();
    }
    private static ObserverState state(String uuid,int entity){var s=new ObserverState();s.camera(new ObserverState.Camera(VIEWER,uuid,entity,WORLD,true));return s;}
    public static void main(String[] args)throws Exception {
        long t=1_000_000_000L;var s=state(A,8);var d=data(A,8);
        check(s.accept(bytes(d),t),"native observer fixture accepted");
        check(s.current(t).data().equals(d),"all original bounded fields preserved");
        check(ObserverView.fields(d).stream().anyMatch(x->x.contains("equipmentEffects[0].newField = true")),"extension fields remain inspectable");
        var rows=ObserverView.overview(d,false);check(rows.stream().anyMatch(x->x.contains("Vanilla XP Lv.7")),"vanilla XP retained");
        check(rows.stream().anyMatch(x->x.contains("RPG Lv.5")),"RPG level separated");
        check(rows.stream().anyMatch(x->x.contains("XP remaining 257")),"XP remaining not a threshold percentage");
        check(rows.stream().noneMatch(x->x.contains("9999")),"unavailable balance remains unknown");
        check(ObserverView.abilities(d,false).stream().anyMatch(x->x.contains("Cooldown remaining ?")),"null remaining never becomes total cooldown");
        var legacy=d.deepCopy();legacy.remove("rpg");legacy.getAsJsonArray("abilities").get(0).getAsJsonObject().remove("cooldownRemainingMs");
        check(ObserverView.abilities(legacy,false).stream().anyMatch(x->x.contains("9.0s")),"explicit old viewer cooldown semantics retained");
        var nullMana=d.deepCopy();nullMana.add("mana",JsonNull.INSTANCE);check(s.accept(bytes(nullMana),t+1),"unknown mana accepted");
        check(ObserverView.overview(nullMana,false).stream().anyMatch(x->x.equals("MP ?/?")),"unknown mana is not zero");
        var bad=d.deepCopy();bad.getAsJsonObject("viewerSession").addProperty("recipientUuid",B);check(!s.accept(bytes(bad),t+2),"wrong recipient rejected");
        check(!s.accept(bytes(data(B,8)),t+3),"same entity different UUID rejected");
        check(!s.accept(bytes(data(A,9)),t+4),"same UUID different entity rejected");
        bad=d.deepCopy();bad.getAsJsonObject("rpg").addProperty("playerUuid",B);check(!s.accept(bytes(bad),t+5),"inner RPG identity cannot cross target");
        bad=d.deepCopy();bad.getAsJsonObject("viewerSession").addProperty("mode","self");check(!s.accept(bytes(bad),t+6),"observer's own state cannot replace target");
        bad=d.deepCopy();bad.getAsJsonObject("viewerSession").addProperty("attached","true");check(!s.accept(bytes(bad),t+7),"string boolean rejected");
        bad=d.deepCopy();bad.getAsJsonObject("vitals").addProperty("food",21);check(!s.accept(bytes(bad),t+8),"invalid survival range rejected");
        bad=d.deepCopy();bad.getAsJsonObject("mana").addProperty("current",50);check(!s.accept(bytes(bad),t+9),"invalid mana range rejected");
        s.camera(new ObserverState.Camera(VIEWER,B,9,WORLD,true));check(s.current(t+10)==null,"camera change clears all old fields immediately");
        check(!s.accept(bytes(d),t+11),"late previous target rejected");check(s.accept(bytes(data(B,9)),t+12),"new target frame accepted");
        s.camera(new ObserverState.Camera(VIEWER,B,9,new Object(),true));check(s.current(t+13)==null,"world change clears matching UUID and entity");
        check(s.accept(bytes(data(B,9)),t+14),"fresh new-world frame accepted");
        long freshEpoch=s.epoch();
        check(s.current(t+ObserverState.STALE_NS+15)==null,"stale state hidden");
        check(s.epoch()>freshEpoch,"expiry invalidates native inventory epoch too");
        long expiredEpoch=s.epoch();s.current(t+ObserverState.STALE_NS+16);
        check(s.epoch()==expiredEpoch,"expiry is one invalidation, not a per-frame epoch change");
        s.clear("disconnect");check(s.current(t+16)==null,"disconnect clears state");
        s=state(A,8);check(!s.accept(new byte[ObserverState.MAX_BYTES+1],t),"oversize payload bounded");
        check(!s.accept(new byte[]{(byte)0xc3,(byte)0x28},t),"invalid UTF-8 rejected");
        check(!s.accept("{\"schemaVersion\":1,\"schemaVersion\":1}".getBytes(StandardCharsets.UTF_8),t),"duplicate JSON keys rejected");
        check(!s.accept((d+" {}").getBytes(StandardCharsets.UTF_8),t),"trailing JSON rejected");
        String deep="{}";for(int i=0;i<24;i++)deep="{\"nested\":"+deep+"}";
        check(!s.accept(deep.getBytes(StandardCharsets.UTF_8),t),"nesting bounded");
        bad=d.deepCopy();bad.addProperty("extension","x".repeat(4097));check(!s.accept(bytes(bad),t),"individual text bounded");
        check(s.accept(bytes(d),t),"valid frame recovers after rejection");
        var detached=new JsonObject();detached.addProperty("schemaVersion",1);var session=new JsonObject();session.addProperty("mode","observer");
        session.addProperty("attached",false);session.addProperty("recipientUuid",VIEWER);detached.add("viewerSession",session);
        long attachedEpoch=s.epoch();
        check(s.accept(bytes(detached),t+1)&&s.current(t+1)==null,"server detach clears data");
        check(s.epoch()>attachedEpoch,"server detach also invalidates mirrored inventory");
        check(s.diagnostics(t+1).get("serverObservedAt")==null,"missing server observation time remains unknown");
        s=state(A,8);s.camera(new ObserverState.Camera(VIEWER,A,8,WORLD,false));
        check(!s.accept(bytes(d),t),"a camera entity without native spectator mode is insufficient");
        s=state(A,8);check(s.accept(bytes(d),t),"observer accepts target after reattachment");
        s.camera(new ObserverState.Camera(B,A,8,WORLD,true));
        check(s.current(t+1)==null&&!s.accept(bytes(d),t+2),"new recipient cannot inherit previous connection state");
        s=state(A,8);bad=d.deepCopy();bad.getAsJsonObject("viewerSession").addProperty("playerName","Yui");
        bad.getAsJsonArray("abilities").get(0).getAsJsonObject().addProperty("name","霜环");
        bad.getAsJsonObject("rpg").addProperty("className","法师");
        check(s.accept(bytes(bad),t),"native account and UTF-8 display labels coexist");
        check(ObserverView.overview(bad,true).stream().anyMatch(x->x.contains("职业 法师"))
                &&ObserverView.abilities(bad,true).stream().anyMatch(x->x.contains("霜环")),"Chinese labels survive projection");
        bad.getAsJsonObject("rpg").getAsJsonObject("economy").addProperty("available",true);
        check(ObserverView.overview(bad,false).stream().anyMatch(x->x.contains("Balance 9999")),"confirmed available balance displayed");
        bad.getAsJsonObject("rpg").addProperty("available",false);
        check(ObserverView.overview(bad,false).stream().noneMatch(x->x.contains("Balance 9999")),"unavailable RPG cannot leak its stale balance");
        bad.getAsJsonObject("vitals").addProperty("health",15.42033576965332);
        bad.getAsJsonObject("vitals").addProperty("armor",15.879999999999999);
        check(ObserverView.overview(bad,false).stream().anyMatch(x->x.contains("HP 15.4/30  Armor 15.9")),"floating gauges have readable precision");
        check(ObserverView.fields(bad).stream().anyMatch(x->x.equals("vitals.health = 15.42033576965332")),"field inspector keeps exact gauge precision");
        check(ObserverView.gauge(JsonNull.INSTANCE).equals("?"),"unknown gauge stays unknown");
        var compact=ObserverView.compact(d,true);check(compact.size()==2,"normal broadcast summary is two rows");
        check(compact.get(0).contains("Lv.")&&compact.get(1).contains("生命")&&compact.get(1).contains("魔力"),"summary retains identity and important live vitals");
        check(compact.stream().noneMatch(x->x.contains("RPG XP")||x.contains("金币")||x.contains("学习点")),"verbose progression moves out of the default on-air panel");
        var hungry=d.deepCopy();hungry.getAsJsonObject("vitals").addProperty("food",0);check(ObserverView.compact(hungry,true).size()==3,"low food gets one compact warning rather than a full statistics panel");
        check(ObserverView.fields(hungry).stream().anyMatch(x->x.equals("vitals.food = 0")),"expanded source inspector preserves original values");
        var bag=new TargetInventory<String>();s=state(A,8);s.accept(bytes(d),t);
        var camera=s.current(t).camera();long epoch=s.epoch();
        List<String> hotbar=new ArrayList<>(Collections.nCopies(9,null));hotbar.set(0,"original-bow");hotbar.set(1,"");
        check(!bag.accept(camera,epoch,B,hotbar,false,t),"foreign UUID inventory rejected");
        check(bag.view(s.current(t),t)==null,"foreign packet does not create target inventory");
        check(bag.accept(camera,epoch,A,hotbar,false,t),"UUID-bearing partial hotbar accepted");
        var projected=bag.view(s.current(t),t);
        check(!projected.full()&&projected.slots().size()==9,"hotbar never claims complete inventory");
        check(projected.slots().get(1).known()&&projected.slots().get(1).item().isEmpty(),"empty distinct from unknown");
        check(!projected.slots().get(2).known(),"missing initial slot stays unknown");
        List<String> delta=new ArrayList<>(Collections.nCopies(9,null));delta.set(2,"original-arrow-3");
        bag.accept(camera,epoch,A,delta,false,t+1);
        check(bag.view(s.current(t),t+1).slots().get(0).item().equals("original-bow"),"null delta preserves received item");
        check(bag.view(s.current(t),t+1).slots().get(2).item().equals("original-arrow-3"),"changed delta applies");
        check(!bag.accept(camera,epoch,A,Collections.nCopies(10,"invalid"),false,t+2),"bad length rejected");
        List<String> full=new ArrayList<>(Collections.nCopies(36,""));full.set(0,"original-bow");full.set(9,"original-ore-17");
        check(bag.accept(camera,epoch,A,full,true,t+3),"full native inventory accepted");
        check(bag.view(s.current(t),t+4).full()&&bag.view(s.current(t),t+4).slots().get(9).item().equals("original-ore-17"),"native slot indexes retained");
        var frame=s.current(t);
        check(bag.view(frame,t+ObserverState.STALE_NS+4)==null,"old item receipt not presented as fresh");
        bag.accept(camera,epoch,A,delta,false,t+ObserverState.STALE_NS+5);
        check(!bag.view(frame,t+ObserverState.STALE_NS+5).full(),"hotbar delta cannot refresh old bag");
        s.camera(new ObserverState.Camera(VIEWER,B,9,WORLD,true));s.accept(bytes(data(B,9)),t+10);
        check(bag.view(s.current(t+10),t+10)==null,"new target cannot inherit inventory");
        check(!bag.accept(s.current(t+10).camera(),s.epoch(),A,hotbar,false,t+11),"late foreign target rejected");
        s.camera(camera);s.accept(bytes(d),t+12);
        check(bag.view(s.current(t+12),t+12)==null,"returning UUID needs fresh inventory");
        bag.accept(camera,s.epoch(),A,hotbar,false,t+13);
        s.clear("disconnect");s.camera(camera);s.accept(bytes(d),t+14);
        check(bag.view(s.current(t+14),t+14)==null,"connection epoch clears same UUID inventory");
        check(!bag.accept(new ObserverState.Camera(VIEWER,VIEWER,8,WORLD,false),s.epoch(),VIEWER,hotbar,false,t+15),"observer inventory cannot become target inventory");
        var bars=new BossBarState();var barId=UUID.fromString(A);
        check(!bars.accept(barId,false,false),"UPDATE without native ADD is unavailable, cannot crash native map lookup");
        check(bars.missing()==1&&bars.uninitializedUpdates()==1,"missing source lifecycle remains explicit");
        check(!bars.accept(barId,false,false)&&bars.missing()==1,"same incomplete bar deduplicated");
        check(bars.accept(barId,true,false)&&bars.missing()==0,"original ADD resolves unavailable bar");
        check(bars.accept(barId,false,true),"complete native bar receives original updates unchanged");
        check(bars.accept(barId,true,false),"REMOVE of absent bar is idempotent");
        for(int i=0;i<100;i++)bars.accept(new UUID(10,i),false,false);
        check(bars.missing()==64,"source fault bookkeeping bounded");
        bars.clear();check(bars.missing()==0&&bars.uninitializedUpdates()>0,"native world clear drops identities but keeps fault counter");
        System.out.println("Observer protocol and display: "+checks+" checks passed");
    }
}
