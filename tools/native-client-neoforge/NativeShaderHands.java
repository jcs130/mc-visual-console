// SPDX-License-Identifier: GPL-3.0-only
package org.mcvisual.neoforge;

import java.lang.reflect.Method;
import net.neoforged.fml.ModList;

/** Optional, explicit Iris API only; no bundled shader code, inventory writes or network calls. */
public final class NativeShaderHands {
 private static boolean initialized,available,reported;
 private static Method packInUse,active;
 private static Object renderer;
 private static void initialize(){
  if(initialized)return;initialized=true;
  if(!ModList.get().isLoaded("iris"))return;
  try{
   var loader=NativeShaderHands.class.getClassLoader();
   packInUse=Class.forName("net.irisshaders.iris.Iris",false,loader).getMethod("isPackInUseQuick");
   var hand=Class.forName("net.irisshaders.iris.pathways.HandRenderer",false,loader);
   renderer=hand.getField("INSTANCE").get(null);active=hand.getMethod("isActive");available=true;
  }catch(ReflectiveOperationException failure){unavailable(failure);}
 }
 private static void unavailable(Exception failure){available=false;if(!reported){reported=true;System.out.println("[MCVisualHands] Iris hand API unavailable: "+failure.getClass().getSimpleName());}}
 public static boolean packEnabled(){initialize();if(!available)return ModList.get().isLoaded("iris");try{return(Boolean)packInUse.invoke(null);}catch(ReflectiveOperationException failure){unavailable(failure);return true;}}
 public static boolean handPass(){initialize();if(!available)return false;try{return(Boolean)active.invoke(renderer);}catch(ReflectiveOperationException failure){unavailable(failure);return false;}}
}
