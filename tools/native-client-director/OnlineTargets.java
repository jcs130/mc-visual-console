package org.mcvisual.director;
import java.util.*;

/** Names/UUIDs from the observer's original player-info list, never guessed Agent identities. */
public final class OnlineTargets {
 public static final int MAX_PLAYERS=256;
 public record Player(String name,String uuid,Boolean spectator){public Player(String name,String uuid){this(name,uuid,null);}}
 public static boolean validName(String name){return name!=null&&name.matches("[A-Za-z0-9_]{1,16}");}
 public static boolean validUuid(String value){try{return value!=null&&UUID.fromString(value).toString().equalsIgnoreCase(value);}catch(IllegalArgumentException ignored){return false;}}
 public static Map<String,String> collect(Collection<Player> players,String observerUuid,String observerName,Set<String> excluded){
  return collect(players,observerUuid,observerName,excluded,null);
 }
 public static Map<String,String> collect(Collection<Player> players,String observerUuid,String observerName,Set<String> excluded,ObserverAccess.Config access){
  var result=new TreeMap<String,String>(String.CASE_INSENSITIVE_ORDER);var ambiguous=new HashSet<String>();var uuids=new HashSet<String>();
  for(var p:players){
   if(p==null||!validName(p.name())||!validUuid(p.uuid())||p.uuid().equalsIgnoreCase(Objects.toString(observerUuid,""))
      ||p.name().equalsIgnoreCase(Objects.toString(observerName,""))||excluded.stream().anyMatch(n->p.name().equalsIgnoreCase(n))
      ||access!=null&&!ObserverAccess.permits(access,p.uuid(),p.spectator()))continue;
   String key=p.name().toLowerCase(Locale.ROOT);
   if(result.containsKey(p.name())&&!result.get(p.name()).equals(p.uuid())){result.remove(p.name());ambiguous.add(key);continue;}
   if(ambiguous.contains(key)||!uuids.add(p.uuid().toLowerCase(Locale.ROOT)))continue;
   if(result.size()<MAX_PLAYERS)result.put(p.name(),p.uuid());
  }
  return Collections.unmodifiableMap(result);
 }
}
