package org.mcvisual.observer;
import java.util.*;

/** Passive packets can precede SET_CAMERA. Release only into that one next native camera generation. */
public final class TargetPacketInbox<T> {
 public static final int MAX_PENDING=8;
 public static final long TTL_NS=2_000_000_000L;
 public record Context(Object connection,Object world,String recipient,long generation,String player,boolean observing) {}
 private record Pending<T>(Context from,String subject,T value,long received,long generation) {}
 private final ArrayDeque<Pending<T>> pending=new ArrayDeque<>();
 private long deferred,released,dropped;
 private static boolean id(String a,String b){return a!=null&&b!=null&&a.equalsIgnoreCase(b);}
 private static boolean usable(Context c){return c!=null&&c.connection()!=null&&c.world()!=null&&c.recipient()!=null&&c.generation()>=0;}
 private static boolean authority(Context a,Context b){return a.connection()==b.connection()&&a.world()==b.world()&&id(a.recipient(),b.recipient());}
 public boolean offer(Context from,String subject,T value,long now){
  if(!usable(from)||subject==null||subject.isBlank()||value==null||now<0){dropped++;return false;}
  while(pending.size()>=MAX_PENDING){pending.removeFirst();dropped++;}
  long expected=from.generation()+(from.observing()&&id(from.player(),subject)?0:1);
  pending.addLast(new Pending<>(from,subject,value,now,expected));deferred++;return true;
 }
 public List<T> drain(Context actual,long now){
  var result=new ArrayList<T>();var it=pending.iterator();
  while(it.hasNext()){
   var p=it.next();
   if(!usable(actual)||now<p.received()||now-p.received()>TTL_NS||!authority(p.from(),actual)||actual.generation()>p.generation()){
    it.remove();dropped++;continue;
   }
   if(actual.generation()<p.generation())continue;
   it.remove();
   if(actual.observing()&&id(actual.player(),p.subject())){result.add(p.value());released++;}else dropped++;
  }
  return List.copyOf(result);
 }
 public void clear(){dropped+=pending.size();pending.clear();}
 public Map<String,Object> diagnostics(){return Map.of("pending",pending.size(),"deferred",deferred,"released",released,"dropped",dropped,"maxPending",MAX_PENDING,"ttlMs",TTL_NS/1_000_000);}
}
