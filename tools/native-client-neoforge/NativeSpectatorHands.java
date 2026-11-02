// SPDX-License-Identifier: GPL-3.0-only
package org.mcvisual.neoforge;

import java.nio.file.*;
import java.util.*;
import com.google.gson.Gson;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.InteractionHand;
import net.minecraft.client.renderer.MultiBufferSource;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.util.Mth;
import org.mcvisual.neoforge.mixin.SpectatorHandRendererAccessor;
import net.neoforged.fml.loading.FMLPaths;
import org.agentmc.platform.ClientRuntime.ClientTickEvents;
import org.mcvisual.observer.NativeObserverClient;

/** Uses the actual camera player's networked equipment. Never changes an inventory or sends input. */
public final class NativeSpectatorHands {
 private static Object tickScope;
 private static AbstractClientPlayer tickTarget;
 private static long drawnAt;
 private static String drawnUuid,mainId,offId,error,drawnPipeline;
 private static int handMask,ticks;
 private static boolean previouslyScoped,writeFailure;
 private static SpectatorHandPolicy.Frame frame(){
  var mc=Minecraft.getInstance();var s=NativeSpectatorSync.scope();var entity=mc.getCameraEntity();
  var actor=entity instanceof AbstractClientPlayer p?p:null;
  return new SpectatorHandPolicy.Frame(s!=null,NativeObserverClient.targetStateFresh(),
   mc.player!=null&&mc.player.isSpectator(),actor==null||actor.isSpectator(),
   mc.player==null?null:mc.player.getStringUUID(),s==null?null:s.player(),
   actor==null?null:actor.getStringUUID(),Objects.equals(tickScope,s)&&tickTarget==actor,
   mc.options.getCameraType().isFirstPerson(),mc.options.hideGui,mc.screen!=null);
 }
 public static AbstractClientPlayer target(){
  return SpectatorHandPolicy.body(frame())?(AbstractClientPlayer)Minecraft.getInstance().getCameraEntity():null;
 }
 public static void tickTarget(AbstractClientPlayer target){
  tickTarget=target;tickScope=target==null?null:NativeSpectatorSync.scope();
 }
 public static boolean renderReady(){return SpectatorHandPolicy.draw(frame());}
 public static boolean renderPassReady(boolean shaderPass){return SpectatorHandPolicy.drawPass(frame(),NativeShaderHands.packEnabled(),shaderPass);}
 public static void renderOriginalItems(float delta,PoseStack pose,MultiBufferSource buffers,int light){
  var actor=target();if(actor==null||!renderPassReady(true))return;
  var accessor=(SpectatorHandRendererAccessor)Minecraft.getInstance().gameRenderer.itemInHandRenderer;
  var main=actor.getMainHandItem();var off=actor.getOffhandItem();
  int mask=SpectatorHandPolicy.hands(main.is(Items.BOW)||off.is(Items.BOW)||main.is(Items.CROSSBOW)||off.is(Items.CROSSBOW),actor.isUsingItem(),actor.getUseItem().is(Items.BOW)||actor.getUseItem().is(Items.CROSSBOW),actor.getUsedItemHand()==InteractionHand.MAIN_HAND,SpectatorHandRendererAccessor.invokeIsChargedCrossbow(main),SpectatorHandRendererAccessor.invokeIsChargedCrossbow(off));
  var swinging=actor.swingingArm==null?InteractionHand.MAIN_HAND:actor.swingingArm;float attack=actor.getAttackAnim(delta),pitch=Mth.lerp(delta,actor.xRotO,actor.getXRot());
  if((mask&1)!=0)accessor.invokeRenderArmWithItem(actor,delta,pitch,InteractionHand.MAIN_HAND,swinging==InteractionHand.MAIN_HAND?attack:0,accessor.getMainHandItem(),1-Mth.lerp(delta,accessor.getOMainHandHeight(),accessor.getMainHandHeight()),pose,buffers,light);
  if((mask&2)!=0)accessor.invokeRenderArmWithItem(actor,delta,pitch,InteractionHand.OFF_HAND,swinging==InteractionHand.OFF_HAND?attack:0,accessor.getOffHandItem(),1-Mth.lerp(delta,accessor.getOOffHandHeight(),accessor.getOffHandHeight()),pose,buffers,light);
  rendered(actor,mask,accessor.getMainHandItem(),accessor.getOffHandItem());
 }
 public static void rendered(AbstractClientPlayer actor,int mask,ItemStack main,ItemStack off){
  if(actor!=target()||!renderReady())return;
  drawnAt=System.currentTimeMillis();drawnUuid=actor.getStringUUID();handMask=mask;
  drawnPipeline=NativeShaderHands.handPass()?"iris_hand_pass":"vanilla_hand_pass";
  mainId=BuiltInRegistries.ITEM.getKey(main.getItem()).toString();
  offId=BuiltInRegistries.ITEM.getKey(off.getItem()).toString();error=null;
 }
 public static void failed(RuntimeException failure){
  String name=failure.getClass().getSimpleName();
  if(!name.equals(error))System.out.println("[MCVisualHands] Original item render failed: "+name);
  error=name;
 }
 public static Map<String,Object> status(){
  var f=frame();var m=new LinkedHashMap<String,Object>();long now=System.currentTimeMillis();
  m.put("schema","mcvisual.native-hands/v1");m.put("at",now);m.put("targetUuid",f.targetUuid());
  m.put("eligible",SpectatorHandPolicy.draw(f));m.put("source","original_camera_entity_equipment");
  m.put("phase",!SpectatorHandPolicy.body(f)?"unavailable":!f.firstPerson()?"not_first_person":error!=null?"render_failed":
   SpectatorHandPolicy.draw(f)&&Objects.equals(drawnUuid,f.targetUuid())&&now>=drawnAt&&now-drawnAt<1000?"drawn":"awaiting_render");
  m.put("drawnAt",drawnAt);m.put("drawnTargetUuid",drawnUuid);m.put("hands",handMask);
  m.put("mainItem",mainId);m.put("offItem",offId);m.put("error",error);
  m.put("drawnPipeline",drawnPipeline);m.put("selectedSlotKnown",NativeSpectatorSync.selected()!=null);m.put("hotbarReady",NativeSpectatorSync.hotbarReady());
  m.put("gameInputs",0);m.put("inventoryWrites",0);return m;
 }
 public static void initialize(){
  ClientTickEvents.END_CLIENT_TICK.register(mc->{
   if(++ticks%20!=0)return;
   boolean scoped=NativeSpectatorSync.scope()!=null;if(!scoped&&!previouslyScoped)return;previouslyScoped=scoped;
   try{
    var target=FMLPaths.GAMEDIR.get().resolve("diagnostics/mcvisual-first-person.json");Files.createDirectories(target.getParent());
    var tmp=target.resolveSibling(target.getFileName()+".tmp");Files.writeString(tmp,new Gson().toJson(status()));
    Files.move(tmp,target,StandardCopyOption.REPLACE_EXISTING);
   }catch(Exception failure){if(!writeFailure)System.out.println("[MCVisualHands] Diagnostic unavailable: "+failure.getClass().getSimpleName());writeFailure=true;}
  });
 }
}
