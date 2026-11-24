import java.util.*;
import java.util.function.Consumer;
import com.google.gson.JsonObject;
import org.mcvisual.observer.*;
public final class TargetPacketInboxCheck {
 static int n;static void check(boolean value,String message){n++;if(!value)throw new AssertionError(message);}
 static final String OBS="11111111-1111-1111-1111-111111111111",A="22222222-2222-2222-2222-222222222222",B="33333333-3333-3333-3333-333333333333";
 static TargetPacketInbox.Context context(Object connection,Object world,String recipient,long generation,String target,boolean observing){return new TargetPacketInbox.Context(connection,world,recipient,generation,target,observing);}
 public static void main(String[] args){
  Object connection=new Object(),world=new Object();long now=1_000_000;
  var self=context(connection,world,OBS,1,OBS,false);var attached=context(connection,world,OBS,2,A,true);
  var inbox=new TargetPacketInbox<String>();
  check(inbox.offer(self,A,"hotbar",now)&&inbox.offer(self,A,"selected",now+1),"server initial packets accepted before SET_CAMERA");
  check(inbox.drain(self,now+2).isEmpty(),"no preview or old camera receives pending inventory");
  check(inbox.drain(attached,now+3).equals(List.of("hotbar","selected")),"original packet order is preserved after actual matching native camera");
  check(inbox.drain(attached,now+4).isEmpty(),"passive payloads are consumed once");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(connection,world,OBS,2,B,true),now+1).isEmpty(),"different target cannot consume staged values");
  check(inbox.drain(context(connection,world,OBS,3,A,true),now+2).isEmpty(),"wrong-target transition cannot revive old payload later");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(connection,world,OBS,4,A,true),now+1).isEmpty(),"same UUID after detach and reattach is a different camera generation");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(new Object(),world,OBS,2,A,true),now+1).isEmpty(),"reconnect cannot inherit old data");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(connection,new Object(),OBS,2,A,true),now+1).isEmpty(),"dimension/world replacement cannot inherit old data");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(connection,world,B,2,A,true),now+1).isEmpty(),"recipient change is not authorized");
  inbox.offer(self,A,"old",now);check(inbox.drain(attached,now+TargetPacketInbox.TTL_NS+1).isEmpty(),"pending values expire after two seconds");
  inbox.offer(self,A,"old",now);check(inbox.drain(attached,now-1).isEmpty(),"clock reversal drops pending values");
  inbox.offer(self,A,"old",now);check(inbox.drain(context(connection,world,OBS,2,OBS,false),now+1).isEmpty(),"manual detach wins over a pending target");
  inbox.offer(self,A,"old",now);inbox.clear();check(inbox.drain(attached,now+1).isEmpty(),"disconnect/stop clear never replays callbacks");
  for(int i=0;i<100;i++)inbox.offer(self,A,"p"+i,now);var bounded=inbox.drain(attached,now+1);
  check(bounded.size()==TargetPacketInbox.MAX_PENDING&&bounded.getLast().equals("p99"),"bounded queue retains latest packets without unbounded memory");
  check(!inbox.offer(null,A,"bad",now),"unscoped packet cannot be retained");
  // Integration: the initial selected slot and all nine real items survive event-before-camera ordering.
  var values=new TargetInventory<String>();int[] selected={-1};Object scope=new Object();
  var camera=new ObserverState.Camera(OBS,A,12,world,true);var snapshot=new ObserverState.Snapshot(new JsonObject(),camera,now,2);
  var packets=new TargetPacketInbox<Consumer<Object>>();
  packets.offer(self,A,s->values.accept(camera,2,A,List.of("stone","sword","empty","seed","torch","pickaxe","map","food","lantern"),false,now),now);
  packets.offer(self,A,s->selected[0]=4,now);
  check(values.view(snapshot,now)==null&&selected[0]==-1,"nothing displayed before native subject confirmation");
  for(var apply:packets.drain(attached,now+1))apply.accept(scope);
  var view=values.view(snapshot,now+2);
  check(view!=null&&view.slots().size()==9&&view.slots().stream().allMatch(TargetInventory.Slot::known),"full initial hotbar baseline remains known after camera bind");
  check(selected[0]==4&&view.slots().get(4).item().equals("torch"),"selected slot is the actual received value, never guessed from held items");
  System.out.println(n+" target packet ordering checks passed");
 }
}
