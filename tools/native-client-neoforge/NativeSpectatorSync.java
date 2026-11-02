package org.mcvisual.neoforge;

import java.util.*;
import java.util.function.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.network.protocol.game.ServerboundContainerClosePacket;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.food.FoodData;
import net.minecraft.world.item.ItemStack;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.NetworkRegistry;
import org.agentmc.platform.ClientRuntime.*;
import org.mcvisual.observer.*;

/** Independent native implementation of the published SpectatorPlus 1.2.1 wire protocol.
 * Only scoped passive display and an explicit E-key read request; never edits player inventory.
 */
public final class NativeSpectatorSync {
 private static final SpectatorDetails DETAILS=new SpectatorDetails();
 private static ItemStack cursor=ItemStack.EMPTY;
 private static Object cursorScope;
 private static NativeObserverClient.NativeScope announcedScope,pendingMenuScope,ownedMenuScope;
 private static long announcedAt;
 private static int pendingMenuId=-1,ownedMenuId=-1;
 private static net.minecraft.client.gui.screens.Screen ownedMenu;
 private static final CustomPacketPayload.Type<Food> FOOD=type("food_sync");
 private static final CustomPacketPayload.Type<Experience> EXPERIENCE=type("experience_sync");
 private static final CustomPacketPayload.Type<Selected> SELECTED=type("selected_slot_sync");
 private static final CustomPacketPayload.Type<ScreenInfo> SCREEN=type("screen_sync");
 private static final CustomPacketPayload.Type<Cursor> CURSOR=type("screen_cursor_sync");
 private static final CustomPacketPayload.Type<InventoryRequest> REQUEST=type("request_inventory_open");
 private record Food(UUID player,int food,float saturation)implements CustomPacketPayload{public Type<Food> type(){return FOOD;}}
 private record Experience(UUID player,float progress,int needed,int level)implements CustomPacketPayload{public Type<Experience> type(){return EXPERIENCE;}}
 private record Selected(UUID player,int slot)implements CustomPacketPayload{public Type<Selected> type(){return SELECTED;}}
 private record ScreenInfo(UUID player,int flags)implements CustomPacketPayload{public Type<ScreenInfo> type(){return SCREEN;}}
 private record Cursor(UUID player,ItemStack item,int origin)implements CustomPacketPayload{public Type<Cursor> type(){return CURSOR;}}
 private record InventoryRequest(UUID player)implements CustomPacketPayload{public Type<InventoryRequest> type(){return REQUEST;}}
 private static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> type(String name){return new CustomPacketPayload.Type<>(ResourceLocation.fromNamespaceAndPath("spectatorplus",name));}
 private static <T extends CustomPacketPayload> void register(CustomPacketPayload.Type<T> type,Function<RegistryFriendlyByteBuf,T> decode,Consumer<T> receive){
  PayloadTypeRegistry.playS2C().register(type,new StreamCodec<RegistryFriendlyByteBuf,T>(){
   public T decode(RegistryFriendlyByteBuf buf){if(buf.readableBytes()>1_048_576)throw new IllegalArgumentException("Observer payload too large");T data=decode.apply(buf);if(buf.isReadable())throw new IllegalArgumentException("Trailing observer payload");return data;}
   public void encode(RegistryFriendlyByteBuf buf,T data){throw new UnsupportedOperationException("Read only");}
  });
  ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->ClientPlayNetworking.registerReceiver(type,(data,ctx)->receive.accept(data)));
 }
 public static void initialize(){
  register(FOOD,b->new Food(b.readUUID(),b.readInt(),b.readFloat()),p->{var s=accept(p.player);if(s!=null)DETAILS.food(s,p.food,p.saturation);});
  register(EXPERIENCE,b->new Experience(b.readUUID(),b.readFloat(),b.readInt(),b.readInt()),p->{var s=accept(p.player);if(s!=null)DETAILS.experience(s,p.progress,p.needed,p.level);});
  register(SELECTED,b->new Selected(b.readUUID(),b.readByte()),p->{var s=accept(p.player);if(s!=null)DETAILS.selected(s,p.slot);});
  register(SCREEN,b->new ScreenInfo(b.readUUID(),b.readByte()),p->{var s=accept(p.player);if(s!=null&&DETAILS.screen(s,p.flags,now())){announcedScope=s;announcedAt=now();}});
  register(CURSOR,b->new Cursor(b.readUUID(),SpectatorInventoryProtocol.readItem(b),b.readByte()),p->{var s=accept(p.player);if(s!=null){cursor=p.item.copy();cursorScope=s;}});
  ClientPlayConnectionEvents.DISCONNECT.register((handler,client)->{DETAILS.reconcile(null);cursor=ItemStack.EMPTY;cursorScope=null;announcedScope=null;pendingMenuScope=null;ownedMenu=null;ownedMenuScope=null;});
  ClientTickEvents.END_CLIENT_TICK.register(client->{
   var current=scope();if(client.screen instanceof ReadOnlyInventoryScreen screen)screen.checkScope();
   if(ownedMenu!=null&&(client.screen!=ownedMenu||!Objects.equals(current,ownedMenuScope)||target()==null)){
    if(client.screen==ownedMenu){if(client.player!=null&&client.getConnection()==ownedMenuScope.connection())client.player.closeContainer();else client.setScreen(null);}
    ownedMenu=null;ownedMenuScope=null;ownedMenuId=-1;
   }
   if(announcedScope!=null&&now()-announcedAt>5000)announcedScope=null;
  });
 }
 public static void registerOutbound(RegisterPayloadHandlersEvent event){
  event.registrar("spectatorplus-1.2.1").optional().playToServer(REQUEST,new StreamCodec<RegistryFriendlyByteBuf,InventoryRequest>(){
   public InventoryRequest decode(RegistryFriendlyByteBuf b){return new InventoryRequest(b.readUUID());}
   public void encode(RegistryFriendlyByteBuf b,InventoryRequest p){b.writeUUID(p.player);}
  },(payload,context)->{throw new UnsupportedOperationException("Client-only observer");});
 }
 public static NativeObserverClient.NativeScope scope(){var s=NativeObserverClient.currentScope();DETAILS.reconcile(s);if(!Objects.equals(cursorScope,s)){cursorScope=null;cursor=ItemStack.EMPTY;}return s;}
 private static NativeObserverClient.NativeScope accept(UUID id){var s=scope();return s!=null&&s.player().equalsIgnoreCase(id.toString())?s:null;}
 private static long now(){return System.nanoTime()/1_000_000;}
 public static AbstractClientPlayer target(){var s=scope();var camera=Minecraft.getInstance().getCameraEntity();return s!=null&&NativeObserverClient.targetStateFresh()&&camera instanceof AbstractClientPlayer p&&!p.isCreative()&&!p.isSpectator()?p:null;}
 public static SpectatorDetails.Food food(){var s=scope();return DETAILS.food(s,target()!=null);}
 public static SpectatorDetails.Experience experience(){var s=scope();return DETAILS.experience(s,target()!=null);}
 public static Integer selected(){var s=scope();return DETAILS.selected(s,target()!=null);}
 public static TargetInventory.View<ItemStack> inventory(){var s=scope();return NativeObserverClient.currentInventory(s!=null&&DETAILS.window(s)>0&&target()!=null);}
 public static ItemStack hotbar(int slot){var view=inventory();if(view==null||slot<0||slot>8)return ItemStack.EMPTY;var item=view.slots().get(slot);return item.known()?item.item():ItemStack.EMPTY;}
 public static boolean hotbarReady(){var view=inventory();return target()!=null&&selected()!=null&&view!=null&&view.slots().size()>=9&&view.slots().subList(0,9).stream().allMatch(TargetInventory.Slot::known);}
 public static boolean requestInventory(){
  var s=scope();var mc=Minecraft.getInstance();if(s==null||target()==null||!DETAILS.request(s,now()))return false;
  boolean can=mc.getConnection()!=null&&NetworkRegistry.hasChannel(mc.getConnection(),REQUEST.id());
  String status=can?"等待服务器完整背包回执":"服务器未开放背包请求，显示已同步库存";
  mc.setScreen(new ReadOnlyInventoryScreen(s,-1,status));
  if(can)try{PacketDistributor.sendToServer(new InventoryRequest(UUID.fromString(s.player())));}catch(RuntimeException unavailable){if(mc.screen instanceof ReadOnlyInventoryScreen screen)screen.status="背包请求未发出；显示已同步库存";}
  return true;
 }
 public static boolean openScreen(int id){
  var s=scope();var announcement=announcedScope;announcedScope=null;
  if(announcement!=null&&(!Objects.equals(announcement,s)||now()-announcedAt>2000)){
   var connection=Minecraft.getInstance().getConnection();if(connection==announcement.connection())connection.send(new ServerboundContainerClosePacket(id));return true;
  }
  if(!DETAILS.open(s,id,now()))return false;
  if(DETAILS.survival(s)){Minecraft.getInstance().setScreen(new ReadOnlyInventoryScreen(s,id,"服务器背包 · 只读"));return true;}
  pendingMenuScope=s;pendingMenuId=id;
  return false;
 }
 public static void confirmMenu(){var mc=Minecraft.getInstance();if(pendingMenuScope!=null&&Objects.equals(pendingMenuScope,scope())&&mc.player!=null&&mc.player.containerMenu.containerId==pendingMenuId&&mc.screen instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen){ownedMenu=mc.screen;ownedMenuScope=pendingMenuScope;ownedMenuId=pendingMenuId;}pendingMenuScope=null;pendingMenuId=-1;}
 public static boolean ownsAnyMenu(){var mc=Minecraft.getInstance();return ownedMenu!=null&&mc.screen==ownedMenu&&mc.getConnection()==ownedMenuScope.connection()&&mc.player!=null&&mc.player.containerMenu.containerId==ownedMenuId;}
 public static void menuClosed(Object screen){if(screen==ownedMenu){DETAILS.close(scope());ownedMenu=null;ownedMenuScope=null;ownedMenuId=-1;}}
 private static boolean displayScope(){return !ownsAnyMenu()||Objects.equals(ownedMenuScope,scope())&&target()!=null;}
 public static ItemStack menuItem(int slot){if(!displayScope())return ItemStack.EMPTY;var view=inventory();if(view==null||slot<0||slot>=view.slots().size())return ItemStack.EMPTY;var item=view.slots().get(slot);return item.known()?item.item():ItemStack.EMPTY;}
 public static boolean knownItem(int slot){if(!displayScope())return false;var view=inventory();return view!=null&&slot>=0&&slot<view.slots().size()&&view.slots().get(slot).known();}
 public static FoodData foodData(){var value=food();if(value==null)return null;var data=new FoodData();data.setFoodLevel(value.level());data.setSaturation(value.saturation());return data;}
 public static ItemStack cursor(){return Objects.equals(scope(),cursorScope)?cursor:ItemStack.EMPTY;}
 public static void close(Object expected,int id){var s=scope();if(!Objects.equals(expected,s)||id<1&&DETAILS.window(s)>0||id>0&&!DETAILS.owns(s,id))return;if(id>0){var connection=Minecraft.getInstance().getConnection();if(connection!=null)connection.send(new ServerboundContainerClosePacket(id));}DETAILS.close(s);}
}
