import org.mcvisual.content.ContentState;
import com.google.gson.*;
import java.util.*;
public final class ContentStateCheck {
 static int count;static long wall=1_700_000_000_000L,nano=10_000_000L;
 static final Gson JSON=new Gson();
 static final ContentState.Scope SCOPE=new ContentState.Scope("instance",1,"offline-server","11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222",4,"minecraft:overworld");
 static void check(boolean result,String message){count++;if(!result)throw new AssertionError(message);}
 static ContentState state(){var s=new ContentState();s.context(SCOPE);return s;}
 static JsonObject frame(){
  var root=new JsonObject();root.addProperty("schema","mcvisual.content/v1");root.add("scope",JSON.toJsonTree(SCOPE));root.addProperty("producer","fixture");root.addProperty("sequence",1);root.addProperty("issuedAt",wall);root.addProperty("expiresAt",wall+4000);
  var p=new JsonObject();p.addProperty("id","behavior");p.addProperty("title","Agent 行为");p.addProperty("anchor","bottom_left");p.addProperty("width",200);p.addProperty("bottomInset",56);
  var r=new JsonObject();r.addProperty("label","动作");r.addProperty("text","查询 · 已受理");r.addProperty("tone","active");var rows=new JsonArray();rows.add(r);p.add("rows",rows);var panels=new JsonArray();panels.add(p);root.add("panels",panels);return root;
 }
 static JsonObject panel(JsonObject f){return f.getAsJsonArray("panels").get(0).getAsJsonObject();}
 static JsonObject row(JsonObject f){return panel(f).getAsJsonArray("rows").get(0).getAsJsonObject();}
 static boolean accept(ContentState s,JsonObject f){return s.accept(f.toString(),wall,nano);}
 public static void main(String[] args){
  var s=state();check(accept(s,frame()),"valid explicit stream frame");check(s.current(nano+1).size()==1,"accepted presentation visible");check(!accept(s,frame()),"sequence replay refused");
  check(s.current(nano+3_999_000_000L).size()==1,"original expiry retained");check(s.current(nano+4_000_000_000L).isEmpty(),"reading/replay cannot extend TTL");
  for(String key:List.of("instanceId","server","subjectUuid","recipientUuid","dimension")){var f=frame();f.getAsJsonObject("scope").addProperty(key,"different");check(!accept(state(),f),"scope mismatch "+key);}
  for(String key:List.of("epoch","entityId")){var f=frame();f.getAsJsonObject("scope").addProperty(key,99);check(!accept(state(),f),"scope mismatch "+key);}
  var absent=new ContentState();check(!accept(absent,frame()),"no world scope cannot accept");
  s=state();accept(s,frame());s.context(new ContentState.Scope("instance",2,SCOPE.server(),SCOPE.recipientUuid(),SCOPE.subjectUuid(),4,SCOPE.dimension()));check(s.current(nano).isEmpty(),"target/world epoch clears immediately");check(!accept(s,frame()),"old connection cannot repopulate new world");
  s=state();accept(s,frame());s.disconnected();check(s.current(nano).isEmpty(),"disconnect hides contents before expiry");s.stop();var after=frame();after.addProperty("sequence",2);check(!accept(s,after),"stopped consumer never revives");
  for(var pair:List.of(new long[]{wall+1001,wall+5000},new long[]{wall-6001,wall+1},new long[]{wall,wall},new long[]{wall,wall+6001},new long[]{Long.MIN_VALUE,wall+1})){
   var f=frame();f.addProperty("issuedAt",pair[0]);f.addProperty("expiresAt",pair[1]);check(!accept(state(),f),"timestamp/TTL bounds");
  }
  var fractional=frame();fractional.addProperty("sequence",1.5);check(!accept(state(),fractional),"fractional sequence refused");
  var duplicate=frame().toString().replace("\"schema\":","\"schema\":\"other\",\"schema\":");check(!state().accept(duplicate,wall,nano),"duplicate JSON keys refused");
  check(!state().accept("x".repeat(32769),wall,nano),"stream byte budget");check(!state().accept("{",wall,nano),"partial JSON refused");
  for(String key:List.of("html","script","command","imageUrl")){var f=frame();panel(f).addProperty(key,"ignored?");check(!accept(state(),f),"no executable/remote content "+key);}
  var duplicatePanel=frame();duplicatePanel.getAsJsonArray("panels").add(panel(duplicatePanel).deepCopy());check(!accept(state(),duplicatePanel),"duplicate IDs/anchors refused");
  var huge=frame();panel(huge).addProperty("width",4294967396L);check(!accept(state(),huge),"oversize number cannot wrap to valid width");
  var tooMany=frame();for(int i=0;i<8;i++)panel(tooMany).getAsJsonArray("rows").add(row(tooMany).deepCopy());check(!accept(state(),tooMany),"row budget");
  for(double p:List.of(-0.1,1.1)){var f=frame();row(f).addProperty("progress",p);check(!accept(state(),f),"progress range");}
  var stringProgress=frame();row(stringProgress).addProperty("progress","0.5");check(!accept(state(),stringProgress),"string probability not accepted as numeric");
  var good=frame();row(good).addProperty("progress",0.82);s=state();check(accept(s,good)&&s.current(nano).get(0).rows().get(0).progress()==0.82,"explicit probability preserved");
  var untrusted=frame();row(untrusted).addProperty("text","safe\u202E§a\ntext");s=state();check(accept(s,untrusted)&&!s.current(nano).get(0).rows().get(0).text().contains("\u202E"),"presentation strips bidi/control/format codes");
  s=state();accept(s,frame());var bad=frame();bad.addProperty("sequence",2);row(bad).addProperty("progress",2);check(!accept(s,bad)&&s.current(nano).get(0).rows().get(0).text().equals("查询 · 已受理"),"malformed batch never half-replaces last valid frame");
  var clear=frame();clear.addProperty("sequence",3);clear.add("panels",new JsonArray());check(accept(s,clear)&&s.current(nano).isEmpty(),"explicit empty frame clears contents");
  System.out.println(count+" content scope, expiry, stream and presentation checks passed");
 }
}
