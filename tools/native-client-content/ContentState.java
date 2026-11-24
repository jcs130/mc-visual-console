package org.mcvisual.content;

import com.google.gson.*;
import com.google.gson.stream.*;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.util.*;

/** Bounded presentation state. No Agent, game action, model or server protocol. */
public final class ContentState {
 public static final int MAX_BYTES=32768;
 public record Scope(String instanceId,long epoch,String server,String recipientUuid,String subjectUuid,int entityId,String dimension){}
 public record Row(String label,String text,String tone,Double progress){}
 public record Panel(String id,String title,String anchor,int width,int bottomInset,List<Row> rows){}
 private Scope scope;
 private final Map<String,Long> sequences=new HashMap<>();
 private List<Panel> panels=List.of();
 private long deadline,accepted,rejected;
 private String reason="waiting_stream";
 private boolean stopped;
 public void context(Scope next){if(!Objects.equals(next,scope)){scope=next;panels=List.of();sequences.clear();deadline=0;reason="context_changed";}}
 public void disconnected(){panels=List.of();deadline=0;reason="stream_disconnected";}
 public void stop(){stopped=true;disconnected();}
 public boolean accept(String json,long wallMs,long nanoTime){
  if(stopped)return reject("stopped");
  try{
   byte[] bytes=json.getBytes(StandardCharsets.UTF_8);if(bytes.length>MAX_BYTES)return reject("frame_too_large");
   JsonObject root=parse(bytes);keys(root,"schema","scope","producer","sequence","issuedAt","expiresAt","panels");
   if(!"mcvisual.content/v1".equals(string(root,"schema")))return reject("schema");
   if(scope==null||!scope.equals(readScope(root.getAsJsonObject("scope"))))return reject("wrong_context");
   String producer=string(root,"producer");if(producer==null||!producer.matches("[A-Za-z0-9_.:-]{1,100}"))return reject("producer");
   long seq=number(root,"sequence"),issued=number(root,"issuedAt"),expires=number(root,"expiresAt");
   if(seq<0||seq>9_007_199_254_740_991L||seq<=sequences.getOrDefault(producer,-1L))return reject("replayed_sequence");
   if(issued<0||expires<0||issued>9_007_199_254_740_991L||expires>9_007_199_254_740_991L||issued>wallMs+1000||wallMs-issued>6000||expires<=wallMs||expires<=issued||expires-issued>6000)return reject("expired_frame");
   if(!sequences.containsKey(producer)&&sequences.size()>=16)return reject("producer_limit");
   var input=root.getAsJsonArray("panels");if(input==null||input.size()>3)return reject("panel_limit");
   List<Panel> next=new ArrayList<>();Set<String> ids=new HashSet<>(),anchors=new HashSet<>();int count=0;
   for(var item:input){
    var p=item.getAsJsonObject();keys(p,"id","title","anchor","width","bottomInset","rows");
    String id=string(p,"id"),title=text(p,"title",72),anchor=string(p,"anchor");
    if(id==null||!id.matches("[A-Za-z0-9_.:-]{1,48}")||!ids.add(id)||!Set.of("bottom_left","bottom_right","top_left","top_right").contains(anchor)||!anchors.add(anchor))return reject("panel_identity");
    int width=Math.toIntExact(number(p,"width")),inset=Math.toIntExact(number(p,"bottomInset"));
    if(width<100||width>260||inset<0||inset>160)return reject("panel_size");
    var raw=p.getAsJsonArray("rows");if(raw==null||raw.size()>8||(count+=raw.size())>16)return reject("row_limit");
    List<Row> rows=new ArrayList<>();
    for(var entry:raw){var r=entry.getAsJsonObject();keys(r,"label","text","tone","progress");
     String label=text(r,"label",24),body=text(r,"text",220),tone=string(r,"tone");
     if(!Set.of("info","muted","active","success","warning","error").contains(tone))return reject("row_tone");
     Double progress=null;if(r.has("progress")){var value=r.get("progress");if(!(value instanceof JsonPrimitive primitive)||!primitive.isNumber())return reject("progress");progress=value.getAsDouble();if(!Double.isFinite(progress)||progress<0||progress>1)return reject("progress");}
     rows.add(new Row(label,body,tone,progress));
    }
    next.add(new Panel(id,title,anchor,width,inset,List.copyOf(rows)));
   }
   sequences.put(producer,seq);panels=List.copyOf(next);deadline=nanoTime+(expires-wallMs)*1_000_000;accepted++;reason="accepted";return true;
  }catch(Exception ignored){return reject("invalid_frame");}
 }
 public List<Panel> current(long nanoTime){if(stopped||scope==null||nanoTime>=deadline)return List.of();return panels;}
 public Map<String,Object> diagnostics(long now){return Map.of("accepted",accepted,"rejected",rejected,"reason",reason,"panelCount",current(now).size(),"stopped",stopped);}
 private boolean reject(String why){rejected++;reason=why;return false;}
 private static String string(JsonObject o,String key){var e=o.get(key);return e instanceof JsonPrimitive p&&p.isString()?p.getAsString():null;}
 private static String text(JsonObject o,String key,int max){String s=string(o,key);if(s==null||s.length()>max*2)throw new IllegalArgumentException("text");var b=new StringBuilder();s.codePoints().limit(max).forEach(c->b.appendCodePoint(Character.isISOControl(c)||Character.getType(c)==Character.FORMAT||c=='§'?' ':c));return b.toString().strip();}
 private static long number(JsonObject o,String key){var e=o.get(key);if(!(e instanceof JsonPrimitive p)||!p.isNumber())throw new IllegalArgumentException("number");return new java.math.BigDecimal(p.getAsString()).longValueExact();}
 private static void keys(JsonObject o,String... names){if(o==null||!Set.of(names).containsAll(o.keySet()))throw new IllegalArgumentException("unknown_field");}
 private static Scope readScope(JsonObject o){keys(o,"instanceId","epoch","server","recipientUuid","subjectUuid","entityId","dimension");return new Scope(string(o,"instanceId"),number(o,"epoch"),string(o,"server"),string(o,"recipientUuid"),string(o,"subjectUuid"),Math.toIntExact(number(o,"entityId")),string(o,"dimension"));}
 private static JsonObject parse(byte[] bytes)throws Exception{
  String s=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
  var in=new JsonReader(new StringReader(s));in.setLenient(false);var value=read(in,0,new int[]{0});if(!(value instanceof JsonObject o)||in.peek()!=JsonToken.END_DOCUMENT)throw new IllegalArgumentException("root");return o;
 }
 private static JsonElement read(JsonReader in,int depth,int[] count)throws Exception{
  if(depth>12||++count[0]>2048)throw new IllegalArgumentException("structure");
  return switch(in.peek()){
   case BEGIN_OBJECT->{in.beginObject();var o=new JsonObject();while(in.hasNext()){String k=in.nextName();if(k.length()>80||o.has(k)||o.size()>80)throw new IllegalArgumentException("duplicate_or_limit");o.add(k,read(in,depth+1,count));}in.endObject();yield o;}
   case BEGIN_ARRAY->{in.beginArray();var a=new JsonArray();while(in.hasNext()){if(a.size()>64)throw new IllegalArgumentException("array");a.add(read(in,depth+1,count));}in.endArray();yield a;}
   case STRING->{String s=in.nextString();if(s.length()>2048)throw new IllegalArgumentException("string");yield new JsonPrimitive(s);}
   case NUMBER->{var n=new java.math.BigDecimal(in.nextString());if(!Double.isFinite(n.doubleValue()))throw new IllegalArgumentException("number");yield new JsonPrimitive(n);}
   case BOOLEAN->new JsonPrimitive(in.nextBoolean());case NULL->{in.nextNull();yield JsonNull.INSTANCE;}default->throw new IllegalArgumentException("token");
  };
 }
}
