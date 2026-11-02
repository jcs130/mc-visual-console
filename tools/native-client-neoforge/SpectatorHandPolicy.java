// SPDX-License-Identifier: GPL-3.0-only
package org.mcvisual.neoforge;

import java.util.Objects;

/** Display-only gates and original vanilla bow/crossbow hand selection. */
public final class SpectatorHandPolicy {
 public record Frame(boolean scoped,boolean fresh,boolean observerSpectator,boolean targetSpectator,
  String observerUuid,String targetUuid,String cameraUuid,boolean sameTickScope,
  boolean firstPerson,boolean hideGui,boolean screenOpen) {}
 public static boolean body(Frame f){
  return f!=null&&f.scoped&&f.fresh&&f.observerSpectator&&!f.targetSpectator
   &&f.observerUuid!=null&&f.targetUuid!=null&&!f.observerUuid.equals(f.targetUuid)
   &&Objects.equals(f.targetUuid,f.cameraUuid);
 }
 public static boolean draw(Frame f){return body(f)&&f.sameTickScope&&f.firstPerson&&!f.hideGui&&!f.screenOpen;}
 public static boolean drawPass(Frame f,boolean shaderPack,boolean shaderPass){return draw(f)&&shaderPack==shaderPass;}
 /** Bits 1/2 select main/off hand, including the vanilla charged-crossbow exclusions. */
 public static int hands(boolean anyBow,boolean using,boolean usedBow,boolean usedMain,boolean mainCharged,boolean offCharged){
  if(!anyBow)return 3;
  if(using){if(usedBow)return usedMain?1:2;return usedMain&&offCharged?1:3;}
  return mainCharged?1:3;
 }
}
