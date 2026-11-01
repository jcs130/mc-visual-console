import org.mcvisual.director.CapturePolicy;
public final class CapturePolicyCheck{
 static int checks;static void check(boolean ok,String msg){checks++;if(!ok)throw new AssertionError(msg);}
 static CapturePolicy.Request request(){return new CapturePolicy.Request("capture-1","server","observer","connection",1,"actor","camera-op",1000,3000,512,512);}
 static CapturePolicy.Scope scope(){return new CapturePolicy.Scope("server","observer","connection",1,"actor","actor","camera-op",true,true,true,false,false);}
 public static void main(String[]args){
  var r=request();var s=scope();check(CapturePolicy.refusal(r,s,1500)==null,"explicit exact binding");
  check(CapturePolicy.refusal(r,s,3000)!=null,"expired");check(CapturePolicy.refusal(r,s,-1)!=null,"future");
  check(CapturePolicy.refusal(r,null,1500)!=null,"no body");
  for(int field=0;field<12;field++){
   var b=new CapturePolicy.Scope(field==0?"other":s.server(),field==1?"other":s.observerUuid(),field==2?"other":s.connectionEpoch(),field==3?2:1,
    field==4?"other":s.targetUuid(),field==5?"other":s.cameraUuid(),field==6?"other":s.cameraRequestId(),field!=7,field!=8,field!=9,field==10,field==11);
   check(CapturePolicy.refusal(r,b,1500)!=null,"scope and program guard "+field);
  }
  var size=CapturePolicy.fit(1920,1080,512,512);check(size[0]==512&&size[1]==288,"landscape resize");
  size=CapturePolicy.fit(1080,1920,384,384);check(size[0]==216&&size[1]==384,"portrait resize");
  size=CapturePolicy.fit(100,100,512,512);check(size[0]==100&&size[1]==100,"no upscaling");
  check(CapturePolicy.refusal(new CapturePolicy.Request("capture","server","observer","connection",1,"actor","camera-op",1000,3000,513,512),s,1500)!=null,"size budget");
  System.out.println("Capture policy checks: "+checks);
 }
}
