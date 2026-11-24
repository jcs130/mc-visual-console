package org.mcvisual.director;

/** Explicit local restrictions, never a replacement for the server's spectator permissions. */
public final class ObserverAccess {
 public static final String SCHEMA="mcvisual.observer-access/v1";
 public record Config(String schema,String mode,String boundTargetUuid) {}
 public static Config server(){return new Config(SCHEMA,"server",null);}
 public static boolean valid(Config c){return c!=null&&SCHEMA.equals(c.schema())
     &&("server".equals(c.mode())&&c.boundTargetUuid()==null||"bound-player".equals(c.mode())&&OnlineTargets.validUuid(c.boundTargetUuid()));}
 public static boolean bound(Config c){return valid(c)&&"bound-player".equals(c.mode());}
 public static boolean permits(Config c,String targetUuid,Boolean spectator){
  if(!valid(c)||!OnlineTargets.validUuid(targetUuid))return false;
  return bound(c)?c.boundTargetUuid().equalsIgnoreCase(targetUuid):Boolean.FALSE.equals(spectator);
 }
 public static boolean discoveryAllowed(Config c,boolean discover){return valid(c)&&(!discover||!bound(c));}
}
