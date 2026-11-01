package org.mcvisual.observer;

import com.google.gson.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.*;
import org.lwjgl.glfw.GLFW;

/** One existing client connection, passive packets and read-only display. No gameplay requests. */
public final class NativeObserverClient implements ClientModInitializer {
    private record Config(boolean enabled, String server, String observer, String language,
                          boolean hideObserverSidebar, boolean writeDiagnostics) {}
    private record Data(byte[] bytes, class_8710.class_9154<Data> type) implements class_8710 {
        @Override public class_8710.class_9154<Data> method_56479() { return type; }
    }
    private static NativeObserverClient instance;
    private static final Map<String,class_8710.class_9154<Data>> TYPES = new LinkedHashMap<>();
    private static final Set<String> CODECS = new HashSet<>();
    private final ObserverState state = new ObserverState();
    private Config config;
    private int mode, page, ticks;
    private class_304 details, next;
    private List<String> rows = List.of();
    private final TargetInventory<class_1799> inventory = new TargetInventory<>();
    private final BossBarState nativeBars = new BossBarState();
    private String problem;
    private boolean diagnosticsFailure;
    private Map<String,Object> hudLayout=Map.of("visible",false);
    @Override public void onInitializeClient() {
        instance=this;
        for(String channel:List.of("mcviewer:state","corti:viewer_state")) {
            var type=new class_8710.class_9154<Data>(class_2960.method_60654(channel)); TYPES.put(channel,type);
            try {
                PayloadTypeRegistry.playS2C().register(type,new class_9139<class_9129,Data>() {
                    @Override public Data decode(class_9129 buffer) {
                        int size=buffer.readableBytes();
                        if(size<1||size>ObserverState.MAX_BYTES) { buffer.skipBytes(size); return new Data(new byte[0],type); }
                        byte[] bytes=new byte[size];buffer.readBytes(bytes);return new Data(bytes,type);
                    }
                    @Override public void encode(class_9129 buffer,Data data) {buffer.writeBytes(data.bytes);}
                }); CODECS.add(channel);
            }catch(IllegalArgumentException conflict) {
                System.out.println("[MCVisualObserver] Codec already owned by another module: "+channel);
            }
        }
        details=KeyBindingHelper.registerKeyBinding(new class_304("key.mcvisual_observer.details",GLFW.GLFW_KEY_F9,"key.categories.mcvisual_observer"));
        next=KeyBindingHelper.registerKeyBinding(new class_304("key.mcvisual_observer.page",GLFW.GLFW_KEY_F10,"key.categories.mcvisual_observer"));
        ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->join(client));
        ClientPlayConnectionEvents.DISCONNECT.register((handler,client)->{
            state.clear("disconnected");inventory.reconcile(null,state.epoch());nativeBars.clear();rows=List.of();
            if(config!=null&&config.writeDiagnostics)diagnostics(false);config=null;
        });
        ClientTickEvents.END_CLIENT_TICK.register(client->{
            if(config==null)return;
            reconcile(client);
            if(client.field_1755==null) {
                while(details.method_1436()){mode=(mode+1)%6;page=0;refresh();}
                while(next.method_1436()){page++;refresh();}
            }
            if(++ticks%10==0)refresh();
            if(config.writeDiagnostics&&ticks%100==0)diagnostics(true);
        });
        HudRenderCallback.EVENT.register((draw,delta)->render(draw));
    }
    private void join(class_310 client) {
        config=null;problem=null;mode=0;page=0;ticks=0;diagnosticsFailure=false;
        state.clear("joining");inventory.reconcile(null,state.epoch());nativeBars.clear();rows=List.of();
        try {
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-native-observer.json");
            if(!Files.isRegularFile(file)||Files.size(file)>16_384)return;
            Config c=new Gson().fromJson(Files.readString(file),Config.class);
            if(c==null||!c.enabled||c.server==null||c.observer==null||client.method_1558()==null
                    ||!c.server.equalsIgnoreCase(client.method_1558().field_3761)
                    ||!c.observer.equalsIgnoreCase(client.method_1548().method_1676()))return;
            config=c;reconcile(client);
            int receivers=0;
            for(var entry:TYPES.entrySet())if(CODECS.contains(entry.getKey())) {
                // Fabric registers the channel on this matching connection only.
                if(ClientPlayNetworking.registerReceiver(entry.getValue(),(data,context)->{
                    reconcile(context.client());state.accept(data.bytes,System.nanoTime());refresh();
                }))receivers++;
            }
            if(receivers==0)problem="Another module owns the observer channels";
            System.out.println("[MCVisualObserver] Explicit observer profile active; receivers="+receivers);
        }catch(Exception failure) {
            config=null;state.clear("profile_unavailable");
            System.out.println("[MCVisualObserver] Profile unavailable: "+failure.getClass().getSimpleName());
        }
    }
    private ObserverState.Camera readCamera(class_310 client) {
        if(client.field_1724==null||client.field_1687==null)return null;
        var target=client.method_1560();
        if(target==null)return null;
        String recipient=client.field_1724.method_5667().toString(),subject=target.method_5667().toString();
        boolean observing=client.field_1724.method_7325()&&target instanceof class_742&&!recipient.equalsIgnoreCase(subject);
        return new ObserverState.Camera(recipient,subject,target.method_5628(),client.field_1687,observing);
    }
    private void reconcile(class_310 client) {
        ObserverState.Camera camera=readCamera(client);state.camera(camera);
        state.current(System.nanoTime());
        inventory.reconcile(camera,state.epoch());
    }
    /** Read the actual UUID-bearing SpectatorPlus packet after its native handler. */
    public static void targetInventory(UUID subject,class_1799[] delta,boolean full) {
        var self=instance;var client=class_310.method_1551();
        if(self==null||self.config==null||subject==null||delta==null||delta.length!=(full?36:9))return;
        self.reconcile(client);ObserverState.Camera camera=self.readCamera(client);
        if(camera==null||!camera.observer())return;
        List<class_1799> copy=new ArrayList<>();
        for(var stack:delta)copy.add(stack==null?null:stack.method_7972());
        if(self.inventory.accept(camera,self.state.epoch(),subject.toString(),copy,full,System.nanoTime()))self.refresh();
    }
    public static boolean hideSidebar() {
        var self=instance;if(self==null||self.config==null||!self.config.hideObserverSidebar)return false;
        var client=class_310.method_1551();self.reconcile(client);var camera=self.readCamera(client);
        return camera!=null&&client.field_1724!=null&&client.field_1724.method_7325();
    }
    private boolean zh(){return config!=null&&"zh_cn".equalsIgnoreCase(config.language);}
    public static boolean scoped(){return instance!=null&&instance.config!=null;}
    public static boolean nativeBarPacket(UUID id,boolean complete,boolean present){
        if(!scoped())return true;
        boolean valid=instance.nativeBars.accept(id,complete,present);
        if(!valid&&instance.nativeBars.uninitializedUpdates()==1)
            System.out.println("[MCVisualObserver] Native bossbar UPDATE before ADD; incomplete bar unavailable, awaiting original ADD");
        return valid;
    }
    public static void nativeBarsCleared(){if(instance!=null)instance.nativeBars.clear();}
    private void refresh() {
        if(config==null)return;var current=state.current(System.nanoTime());
        if(current==null){rows=List.of(zh()?"观战目标信息待同步":"Waiting for target state");return;}
        List<String> source=switch(mode){
            case 1->ObserverView.overview(current.data(),zh());
            case 2->ObserverView.abilities(current.data(),zh());
            case 3->{
                List<String> lines=new ArrayList<>();lines.add(zh()?"观战对象 · 原生背包（只读）":"Target · Native inventory (read only)");
                var view=inventory.view(current,System.nanoTime());
                if(view==null)lines.add(zh()?"等待目标背包包；按 E 原生只读查看":"Waiting for target inventory; E opens original read-only screen");
                else {
                    lines.add((view.full()?(zh()?"完整背包":"Full inventory"):(zh()?"仅快捷栏；完整背包按 E":"Hotbar only; E for full inventory"))
                            +String.format(Locale.ROOT,zh()?" · 收包 %.1f 秒前":" · received %.1fs ago",view.hotbarAgeMs()/1000.0));
                    for(var slot:view.slots()){
                        if(!slot.known()){lines.add("#"+slot.index()+" ?");continue;}
                        var stack=slot.item();if(stack.method_7960())continue;
                        lines.add("#"+slot.index()+" "+stack.method_7964().getString()+" ×"+stack.method_7947());
                    }
                }
                yield lines;
            }
            case 4->ObserverView.fields(current.data());
            default->ObserverView.compact(current.data(),zh());
        };
        if(mode==0){rows=source;return;}
        var client=class_310.method_1551();int width=Math.max(32,Math.min(mode==1?260:400,client.method_22683().method_4486()-16));
        List<String> wrapped=new ArrayList<>();
        for(String line:source){
            String left=line;
            do {
                String part=client.field_1772.method_27523(left,width);
                if(part.isEmpty())part=left.isEmpty()?"":left.substring(0,Character.charCount(left.codePointAt(0)));
                wrapped.add(part);left=left.substring(part.length());
            }while(!left.isEmpty());
        }
        if(nativeBars.missing()>0)wrapped.add(zh()?"原生进度条缺完整数据 · "+nativeBars.missing():"Native bars awaiting complete data · "+nativeBars.missing());
        rows=List.copyOf(wrapped);
    }
    private void render(class_332 draw) {
        hudLayout=Map.of("visible",false);
        if(config==null)return;var client=class_310.method_1551();reconcile(client);
        var camera=readCamera(client);if(camera==null||mode==5||client.field_1755!=null)return;
        if(!camera.observer()&&(client.field_1724==null||!client.field_1724.method_7325()))return;
        var snapshot=state.current(System.nanoTime());
        // Validate at draw time too: a same-frame camera change cannot show cached old rows.
        List<String> visible=!camera.observer()?List.of(zh()?"观战机位 · 未附身目标":"Observer camera · No attached target",
                zh()?"等待自动选镜或手动恢复跟拍":"Waiting for camera selection or explicit resume",
                zh()?"当前没有目标职业／背包读数":"No target profession or inventory readings")
            :snapshot==null?List.of(problem!=null?problem:(zh()?"观战目标信息待同步":"Waiting for target state")):rows;
        boolean compact=mode==0;
        int desired=compact?Math.max(84,visible.stream().mapToInt(client.field_1772::method_1727).max().orElse(84)):mode==1?260:400;
        int width=Math.max(32,Math.min(compact?Math.min(170,desired):desired,draw.method_51421()-16)), x=draw.method_51421()-width-8,y=compact?8:14;
        int count=compact?3:Math.max(3,(draw.method_51443()-44)/11);
        int pages=Math.max(1,(visible.size()+count-1)/count),start=(page%pages)*count;
        int end=Math.min(visible.size(),start+count);
        draw.method_25294(x-4,y-4,x+width+4,y+(end-start)*11+16,compact?0x70101820:0xB0101820);
        for(int i=start;i<end;i++)draw.method_51433(client.field_1772,client.field_1772.method_27523(visible.get(i),width),x,y+(i-start)*11,i==0?0xFF9EE7FF:compact&&i>=2?0xFFFFC25C:0xFFF3F5FA,true);
        draw.method_51433(client.field_1772,compact?(zh()?"F9 详情":"F9 Details"):"F9 / F10  "+(start+1)+"–"+end+"/"+visible.size(),x,y+(end-start)*11+3,0xFFBCC5D6,true);
        hudLayout=Map.of("visible",true,"mode",compact?"compact":"details","x",x-4,"y",y-4,"width",width+8,"height",(end-start)*11+20,
            "lines",end-start,"canvasWidth",draw.method_51421(),"canvasHeight",draw.method_51443());
        var inventoryView=inventory.view(snapshot,System.nanoTime());
        if(mode==3&&inventoryView!=null) {
            // Original native ItemStacks retain components and original resource-pack models.
            int gridY=14+(end-start)*11+24,slot=0;
            for(var item:inventoryView.slots()){if(gridY+(slot/9)*19+18>=draw.method_51443())break;
                if(!item.known()){slot++;continue;}var stack=item.item();
                draw.method_51427(stack,x+(slot%9)*19,gridY+(slot/9)*19);
                draw.method_51446(client.field_1772,stack,x+(slot%9)*19,gridY+(slot/9)*19);slot++;}
        }
    }
    private void diagnostics(boolean connected) {
        try {
            Map<String,Object> data=new LinkedHashMap<>(state.diagnostics(System.nanoTime()));
            data.put("nativeVersion",FabricLoader.getInstance().getModContainer("mcvisual-native-observer").map(m->m.getMetadata().getVersion().getFriendlyString()).orElse("unknown"));data.put("observerSelfSidebarHidden",hideSidebar());
            data.put("hud",hudLayout);
            data.put("recordedAt",Instant.now().toString());data.put("connected",connected);
            var view=inventory.view(state.current(System.nanoTime()),System.nanoTime());
            data.put("nativeInventoryReceived",view!=null);data.put("nativeInventorySlots",view==null?0:view.slots().size());
            data.put("inventorySource",view==null?null:"spectatorplus_uuid_packet");
            data.put("inventoryScope",view==null?null:view.full()?"full":"hotbar_only");
            data.put("inventoryKnownSlots",view==null?0:view.slots().stream().filter(TargetInventory.Slot::known).count());
            data.put("inventoryHotbarAgeMs",view==null?null:view.hotbarAgeMs());
            data.put("inventoryFullAgeMs",view==null?null:view.fullAgeMs());
            data.put("nativeBossBarsMissing",nativeBars.missing());
            data.put("nativeBossBarUpdatesBeforeAdd",nativeBars.uninitializedUpdates());
            data.put("problem",problem);
            Path out=FabricLoader.getInstance().getGameDir().resolve("diagnostics/mcvisual-native-observer.json");
            Files.createDirectories(out.getParent());Files.writeString(out,new GsonBuilder().serializeNulls().create().toJson(data));
        }catch(Exception failure){if(!diagnosticsFailure)System.out.println("[MCVisualObserver] Diagnostics unavailable: "+failure.getClass().getSimpleName());diagnosticsFailure=true;}
    }
}
