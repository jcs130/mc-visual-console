package org.mcvisual.observer;

/** Display-only dismissal of a read-only inventory; target coordinates, never camera motion. */
public final class InventoryTravelPolicy {
 private final long openedAt;private long lastInput,lastMotion;private double originX,originZ,lastX,lastZ;private boolean sampled,pinned;
 public InventoryTravelPolicy(long now){openedAt=now;lastInput=now;}
 public boolean pinned(){return pinned;}
 public void togglePin(long now){pinned=!pinned;lastInput=now;}
 public void interaction(long now){lastInput=now;}
 public boolean observe(long now,double x,double z,boolean fresh){
  if(!fresh||!Double.isFinite(x)||!Double.isFinite(z)){sampled=false;return false;}
  if(!sampled){sampled=true;originX=lastX=x;originZ=lastZ=z;lastMotion=now;return false;}
  double step=Math.hypot(x-lastX,z-lastZ);
  // A server teleport is a new display context, not a measured walking segment.
  if(step>32){originX=x;originZ=z;lastInput=now;}
  if(step>.04)lastMotion=now;
  lastX=x;lastZ=z;
  return !pinned&&now>=openedAt+6000&&now>=lastInput+4000&&now-lastMotion<=1500&&Math.hypot(x-originX,z-originZ)>=8;
 }
}
