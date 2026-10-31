package org.mcvisual.director;

import java.util.*;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.*;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL12;
import org.lwjgl.opengl.GL14;
import org.lwjgl.opengl.GL30;

/** One bounded GPU-only old-frame texture; no screen scraping, network or CPU pixel readback. */
public final class FrameBlend {
    private static final class CapturedTexture extends class_1044 {
        @Override public void method_4625(class_3300 resources) {}
    }
    private static final class_2960 ID=class_2960.method_60655("mcvisual","director-transition");
    private static final TransitionEnvelope ENVELOPE=new TransitionEnvelope();
    private static CapturedTexture texture;
    private static int width,height,durationMs=350,readyFrames;
    private static boolean enabled,captured;private static String problem="disabled";
    public static void configure(boolean use,int duration){
        enabled=use&&duration>=100&&duration<=1500;durationMs=duration;
        problem=enabled?null:use?"invalid_duration":"disabled";ENVELOPE.abort();captured=false;
    }
    public static void begin(class_310 client,String requestId){
        if(!enabled)return;
        captured=false;readyFrames=0;
        try{
            var framebuffer=client.method_1522();int w=framebuffer.field_1482,h=framebuffer.field_1481;
            if(w<1||h<1||(long)w*h>4_194_304||framebuffer.field_1476<0)throw new IllegalStateException("capture_budget_or_framebuffer");
            if(texture==null){texture=new CapturedTexture();client.method_1531().method_4616(ID,texture);}
            int oldRead=GL11.glGetInteger(GL30.GL_READ_FRAMEBUFFER_BINDING),oldTexture=GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
            try{
                GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER,framebuffer.field_1476);
                GL11.glBindTexture(GL11.GL_TEXTURE_2D,texture.method_4624());
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_MIN_FILTER,GL11.GL_LINEAR);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_MAG_FILTER,GL11.GL_LINEAR);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_WRAP_S,GL12.GL_CLAMP_TO_EDGE);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_WRAP_T,GL12.GL_CLAMP_TO_EDGE);
                GL11.glCopyTexImage2D(GL11.GL_TEXTURE_2D,0,GL11.GL_RGBA8,0,0,w,h,0);
            }finally{GL11.glBindTexture(GL11.GL_TEXTURE_2D,oldTexture);GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER,oldRead);}
            width=w;height=h;captured=true;problem=null;ENVELOPE.begin(requestId,System.currentTimeMillis(),durationMs,10000);
        }catch(Exception error){problem=error.getClass().getSimpleName()+":"+error.getMessage();ENVELOPE.abort();}
    }
    public static void draw(class_310 client,class_332 draw,String requestId,boolean nativeReady,boolean terminal){
        if(!enabled||!captured||!ENVELOPE.active())return;
        if(client.field_1755!=null||terminal){abort();return;}
        if(nativeReady){if(++readyFrames>=2)ENVELOPE.ready(requestId,System.currentTimeMillis());}else readyFrames=0;
        long now=System.currentTimeMillis();float alpha=(float)ENVELOPE.alpha(now);if(alpha<=0)return;
        int w=draw.method_51421(),h=draw.method_51443();
        if(Math.abs(w/(double)h-width/(double)height)>.03){problem="resized";abort();return;}
        boolean wasBlending=GL11.glIsEnabled(GL11.GL_BLEND);
        int srcRgb=GL11.glGetInteger(GL14.GL_BLEND_SRC_RGB),dstRgb=GL11.glGetInteger(GL14.GL_BLEND_DST_RGB),
            srcAlpha=GL11.glGetInteger(GL14.GL_BLEND_SRC_ALPHA),dstAlpha=GL11.glGetInteger(GL14.GL_BLEND_DST_ALPHA);
        float[] previousColor=RenderSystem.getShaderColor().clone();
        try{
            RenderSystem.enableBlend();RenderSystem.defaultBlendFunc();draw.method_51422(1,1,1,alpha);
            // FBO textures have a lower-left origin; GUI texture coordinates need Y flipped.
            draw.method_25293(ID,0,0,w,h,0,(float)height,width,-height,width,height);draw.method_51452();
        }finally{
            draw.method_51422(previousColor[0],previousColor[1],previousColor[2],previousColor[3]);
            RenderSystem.blendFuncSeparate(srcRgb,dstRgb,srcAlpha,dstAlpha);if(!wasBlending)RenderSystem.disableBlend();
        }
        if("holding".equals(ENVELOPE.phase()))draw.method_51433(client.field_1772,"正在切换镜头…",12,h-24,0xffffffff,true);
    }
    public static void abort(){ENVELOPE.abort();readyFrames=0;}
    public static void close(){abort();if(texture!=null){texture.close();texture=null;}captured=false;}
    public static Map<String,Object> status(){
        var out=new LinkedHashMap<String,Object>();out.put("enabled",enabled);out.put("phase",ENVELOPE.phase());out.put("requestId",ENVELOPE.id());
        out.put("active",ENVELOPE.active());out.put("durationMs",durationMs);out.put("captured",captured);out.put("width",width);out.put("height",height);
        out.put("oldFrameAlpha",ENVELOPE.alpha(System.currentTimeMillis()));
        out.put("allocatedBytes",texture==null?0:(long)width*height*4);out.put("problem",problem);return out;
    }
}
