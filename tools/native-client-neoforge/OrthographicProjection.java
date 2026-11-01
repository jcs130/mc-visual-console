package org.mcvisual.neoforge;
/** Deliberately compatible config boundary, without loading a Fabric mod on NeoForge. */
public final class OrthographicProjection {
 public static final Config CONFIG=new Config();
 public static final class Config {
  public boolean enabled,fixed;public float fixed_yaw=45,fixed_pitch=35.264f,scale_x=16,scale_y=16,min_distance=-32,max_distance=96;
  public void setFixed(boolean value){fixed=value;}public void setFixedYaw(float value){fixed_yaw=value;}
  public void setFixedPitch(float value){fixed_pitch=value;}public void setScaleX(float value){scale_x=value;}public void setScaleY(float value){scale_y=value;}
 }
 public static boolean active(){return CONFIG.enabled&&CONFIG.fixed&&org.mcvisual.director.NativeDirectorClient.orthographicProjecting();}
}
