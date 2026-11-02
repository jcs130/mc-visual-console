package org.mcvisual.director;

import com.google.gson.*;
import java.nio.*;
import java.nio.file.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import net.minecraft.*;
import org.lwjgl.opengl.*;
import org.lwjgl.system.MemoryUtil;

/** Explicit file request, one transient JPEG, no ports, periodic capture or hidden model calls. */
public final class NativeVisionCapture {
    private static final Gson JSON=new Gson();
    private static final ExecutorService ENCODER=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"mcvisual-vision-encoder");t.setDaemon(true);return t;});
    private static final AtomicBoolean BUSY=new AtomicBoolean();
    private static volatile long generation;
    private static volatile String latestId;
    private static boolean enabled,compositedAvailable;private static Path requestFile,output;
    private static long lastPoll,lastCapture,lastModified=-1;
    private static CapturePolicy.Request pending;
    private static final Set<String> seen=new LinkedHashSet<>();
    private static volatile Map<String,Object> status=Map.of("enabled",false);
    public static void configure(boolean use,Path config,Path game){
        generation++;enabled=use;pending=null;latestId=null;lastPoll=0;lastModified=-1;seen.clear();
        requestFile=config.resolve("mcvisual-vision-request.json");output=game.resolve("diagnostics/vision");
        status=Map.of("enabled",use,"maxSide",512,"onDemand",true);
    }
    public static void reset(){generation++;enabled=false;pending=null;latestId=null;status=Map.of("enabled",false);}
    public static void invalidate(){if(pending!=null||BUSY.get()){generation++;pending=null;latestId=null;}}
    public static Map<String,Object> status(){return status;}
    public static void declareCompositedFrameSupport(){compositedAvailable=true;}
    private static void atomic(Path target,byte[] data)throws Exception{
        Files.createDirectories(target.getParent());Path tmp=target.resolveSibling(target.getFileName()+".tmp");
        Files.write(tmp,data);Files.move(tmp,target,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
    }
    private static void refused(CapturePolicy.Request r,String reason){
        if(r==null||r.id()==null)return;
        var receipt=new LinkedHashMap<String,Object>();receipt.put("schema","mcvisual.vision-frame/v1");receipt.put("id",r.id());
        receipt.put("phase","rejected");receipt.put("reason",reason);receipt.put("at",System.currentTimeMillis());
        status=Map.of("enabled",true,"phase","rejected","reason",reason);
        try{atomic(output.resolve("frame.json"),JSON.toJson(receipt).getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(Exception ignored){}
    }
    public static void poll(CapturePolicy.Scope scope,long now){
        if(!enabled||now-lastPoll<200)return;lastPoll=now;
        try{
            if(!Files.isRegularFile(requestFile)||Files.size(requestFile)>4096)return;
            long changed=Files.getLastModifiedTime(requestFile).toMillis();if(changed==lastModified)return;lastModified=changed;
            var r=JSON.fromJson(Files.readString(requestFile),CapturePolicy.Request.class);
            if(r==null||seen.contains(r.id()))return;
            seen.add(r.id());while(seen.size()>128)seen.remove(seen.iterator().next());latestId=r.id();
            String why=CapturePolicy.refusal(r,scope,now);if(why==null&&r.composited()&&!compositedAvailable)why="composited_capture_unavailable";if(why!=null){pending=null;refused(r,why);return;}pending=r;
        }catch(Exception ignored){status=Map.of("enabled",true,"phase","rejected","reason","invalid_capture_request");}
    }
    /** Called on the render thread after world rendering, before OS/desktop overlays. */
    public static void render(class_310 client,CapturePolicy.Scope scope){
        renderStage(client,scope,false);
    }
    /** Final game framebuffer only; no OS window activation or desktop capture. */
    public static void renderComposited(class_310 client,CapturePolicy.Scope scope){
        if(compositedAvailable)renderStage(client,scope,true);
    }
    private static void renderStage(class_310 client,CapturePolicy.Scope scope,boolean composited){
        if(!enabled||pending==null||BUSY.get())return;long now=System.currentTimeMillis();var r=pending;
        if(r.composited()!=composited)return;
        String why=CapturePolicy.refusal(r,scope,now);if(why!=null){pending=null;refused(r,why);return;}
        if(now-lastCapture<750)return;
        var framebuffer=client.method_1522();int sw=framebuffer.field_1482,sh=framebuffer.field_1481;
        if(sw<1||sh<1||(long)sw*sh>16_777_216||framebuffer.field_1476<0){pending=null;refused(r,"capture_framebuffer_unavailable");return;}
        int[] size=CapturePolicy.fit(sw,sh,r.maxWidth(),r.maxHeight());int w=size[0],h=size[1];
        int oldRead=GL11.glGetInteger(GL30.GL_READ_FRAMEBUFFER_BINDING),oldDraw=GL11.glGetInteger(GL30.GL_DRAW_FRAMEBUFFER_BINDING),
            oldTexture=GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D),oldPack=GL11.glGetInteger(GL11.GL_PACK_ALIGNMENT),oldPbo=GL11.glGetInteger(GL21.GL_PIXEL_PACK_BUFFER_BINDING),
            oldRow=GL11.glGetInteger(GL11.GL_PACK_ROW_LENGTH),oldSkipRows=GL11.glGetInteger(GL11.GL_PACK_SKIP_ROWS),oldSkipPixels=GL11.glGetInteger(GL11.GL_PACK_SKIP_PIXELS);
        boolean scissor=GL11.glIsEnabled(GL11.GL_SCISSOR_TEST);
        int texture=0,fbo=0;ByteBuffer buffer=null;byte[] pixels;
        try{
            texture=GL11.glGenTextures();fbo=GL30.glGenFramebuffers();
            GL11.glBindTexture(GL11.GL_TEXTURE_2D,texture);GL11.glTexImage2D(GL11.GL_TEXTURE_2D,0,GL11.GL_RGBA8,w,h,0,GL11.GL_RGBA,GL11.GL_UNSIGNED_BYTE,(ByteBuffer)null);
            GL30.glBindFramebuffer(GL30.GL_DRAW_FRAMEBUFFER,fbo);GL30.glFramebufferTexture2D(GL30.GL_DRAW_FRAMEBUFFER,GL30.GL_COLOR_ATTACHMENT0,GL11.GL_TEXTURE_2D,texture,0);
            if(GL30.glCheckFramebufferStatus(GL30.GL_DRAW_FRAMEBUFFER)!=GL30.GL_FRAMEBUFFER_COMPLETE)throw new IllegalStateException("incomplete_capture_framebuffer");
            GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER,framebuffer.field_1476);
            GL11.glDisable(GL11.GL_SCISSOR_TEST);
            GL30.glBlitFramebuffer(0,0,sw,sh,0,0,w,h,GL11.GL_COLOR_BUFFER_BIT,GL11.GL_LINEAR);
            GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER,fbo);GL11.glReadBuffer(GL30.GL_COLOR_ATTACHMENT0);
            GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER,0);GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT,1);
            GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH,0);GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS,0);GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS,0);
            buffer=MemoryUtil.memAlloc(w*h*4);GL11.glReadPixels(0,0,w,h,GL11.GL_RGBA,GL11.GL_UNSIGNED_BYTE,buffer);
            pixels=new byte[w*h*4];buffer.get(pixels);
        }catch(Exception failure){pending=null;refused(r,"capture_read_failed");return;}
        finally{
            GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER,oldPbo);GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT,oldPack);
            GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH,oldRow);GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS,oldSkipRows);GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS,oldSkipPixels);
            if(scissor)GL11.glEnable(GL11.GL_SCISSOR_TEST);
            GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER,oldRead);GL30.glBindFramebuffer(GL30.GL_DRAW_FRAMEBUFFER,oldDraw);
            GL11.glBindTexture(GL11.GL_TEXTURE_2D,oldTexture);if(fbo!=0)GL30.glDeleteFramebuffers(fbo);if(texture!=0)GL11.glDeleteTextures(texture);if(buffer!=null)MemoryUtil.memFree(buffer);
        }
        pending=null;lastCapture=now;BUSY.set(true);long boundGeneration=generation;Path folder=output;
        status=Map.of("enabled",true,"phase","encoding","maxSide",512);
        ENCODER.execute(()->{
            try{
                var image=new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB);
                for(int y=0;y<h;y++)for(int x=0;x<w;x++){int p=((h-1-y)*w+x)*4;
                    image.setRGB(x,y,((pixels[p]&255)<<16)|((pixels[p+1]&255)<<8)|(pixels[p+2]&255));}
                var bytes=new java.io.ByteArrayOutputStream();if(!ImageIO.write(image,"jpeg",bytes))throw new IllegalStateException("jpeg_unavailable");
                if(!enabled||generation!=boundGeneration||!Objects.equals(latestId,r.id()))return;
                var meta=new LinkedHashMap<String,Object>();meta.put("schema","mcvisual.vision-frame/v1");meta.put("id",r.id());meta.put("phase","captured");meta.put("capturedAt",now);
                meta.put("width",w);meta.put("height",h);meta.put("mime","image/jpeg");meta.put("bytes",bytes.size());meta.put("file","frame.jpg");
                meta.put("sha256",HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray())));
                meta.put("server",scope.server());meta.put("observerUuid",scope.observerUuid());meta.put("connectionEpoch",scope.connectionEpoch());meta.put("nativeWorldEpoch",scope.nativeWorldEpoch());
                meta.put("targetUuid",scope.targetUuid());meta.put("cameraRequestId",scope.cameraRequestId());
                meta.put("captureStage",r.composited()?"composited":"world");
                atomic(folder.resolve("frame.jpg"),bytes.toByteArray());
                if(!enabled||generation!=boundGeneration||!Objects.equals(latestId,r.id()))return;
                atomic(folder.resolve("frame.json"),JSON.toJson(meta).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                status=Map.of("enabled",true,"phase","captured","width",w,"height",h,"maxSide",512);
            }catch(Exception failure){if(generation==boundGeneration)refused(r,"capture_encode_failed");}
            finally{BUSY.set(false);}
        });
    }
}
