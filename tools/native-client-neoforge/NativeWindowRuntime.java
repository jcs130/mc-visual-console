package org.mcvisual.neoforge;

import com.google.gson.Gson;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import net.minecraft.client.Minecraft;
import net.neoforged.fml.loading.FMLPaths;
import org.lwjgl.glfw.GLFW;
import org.mcvisual.director.WindowPolicy;

/** Window-only integration: no input injection, desktop focus calls, network or model loop. */
public final class NativeWindowRuntime {
    private static final Gson JSON=new Gson();
    private static final String INSTANCE=UUID.randomUUID().toString();
    private static final Path CONFIG=policyFile();
    private static final WindowPolicy.Config STARTUP=load();
    private static WindowPolicy.Config requested=STARTUP;
    private static Path output;
    private static long lastPoll,lastWrite,lastModified=-1,frames,worldFrames,frameAt,worldFrameAt,grabSuppressed,resizeStarted;
    private static boolean attempted,restartRequired;
    private static String resizePhase="unchanged",error="";
    private static Path policyFile(){var p=System.getProperty("mcvisual.windowPolicyFile");return p==null||p.isBlank()?null:Path.of(p).toAbsolutePath();}
    private static WindowPolicy.Config load(){
        if(CONFIG==null)return WindowPolicy.disabled();
        try{if(Files.size(CONFIG)>8192)return WindowPolicy.disabled();var c=JSON.fromJson(Files.readString(CONFIG),WindowPolicy.Config.class);return WindowPolicy.valid(c)?c:WindowPolicy.disabled();}
        catch(Exception ignored){return WindowPolicy.disabled();}
    }
    public static boolean enabled(){return STARTUP.enabled();}
    public static boolean freeCursor(){return WindowPolicy.suppressGrab(STARTUP);}
    public static boolean suppressMouseGrab(){if(WindowPolicy.suppressGrab(STARTUP)){grabSuppressed++;return true;}return false;}
    public static long suppressedGrabRequests(){return grabSuppressed;}
    public static void beforeWindowCreation(){
        if(WindowPolicy.avoidFocus(STARTUP)){
            GLFW.glfwWindowHint(GLFW.GLFW_FOCUSED,GLFW.GLFW_FALSE);
            GLFW.glfwWindowHint(GLFW.GLFW_FOCUS_ON_SHOW,GLFW.GLFW_FALSE);
        }
    }
    public static void initialize(){if(enabled())output=FMLPaths.GAMEDIR.get().resolve("diagnostics/mcvisual-native-window.json");}
    public static void renderedFrame(){if(enabled()){frames++;frameAt=System.currentTimeMillis();}}
    public static void renderedWorld(){if(enabled()){worldFrames++;worldFrameAt=System.currentTimeMillis();}}
    private static void poll(long now){
        if(CONFIG==null||now-lastPoll<500)return;lastPoll=now;
        try{
            long changed=Files.getLastModifiedTime(CONFIG).toMillis();if(changed==lastModified)return;
            if(Files.size(CONFIG)>8192){error="window_config_too_large";return;}
            var c=JSON.fromJson(Files.readString(CONFIG),WindowPolicy.Config.class);
            if(!WindowPolicy.valid(c)){error="window_config_invalid";return;}
            lastModified=changed;
            if(!WindowPolicy.sameStartupPolicy(STARTUP,c)){restartRequired=true;error="startup_policy_change_requires_restart";return;}
            requested=c;attempted=false;restartRequired=false;resizeStarted=0;resizePhase="pending";error="";
        }catch(Exception ignored){error="window_config_unavailable";}
    }
    public static void tick(Minecraft mc){
        if(!enabled()||mc==null||mc.getWindow()==null)return;
        long now=System.currentTimeMillis(),handle=mc.getWindow().getWindow();if(handle==0)return;
        poll(now);
        boolean focused=GLFW.glfwGetWindowAttrib(handle,GLFW.GLFW_FOCUSED)==GLFW.GLFW_TRUE;
        boolean iconified=GLFW.glfwGetWindowAttrib(handle,GLFW.GLFW_ICONIFIED)==GLFW.GLFW_TRUE;
        if(STARTUP.renderUnfocused()){
            mc.options.pauseOnLostFocus=false;
            int cap=WindowPolicy.frameLimit(requested,mc.options.framerateLimit().get(),focused,iconified,mc.level!=null);
            if(mc.getWindow().getFramerateLimit()!=cap)mc.getWindow().setFramerateLimit(cap);
        }
        int[] ww={0},wh={0},dw={0},dh={0};GLFW.glfwGetWindowSize(handle,ww,wh);GLFW.glfwGetFramebufferSize(handle,dw,dh);
        var target=mc.getMainRenderTarget();int fw=target.width,fh=target.height;
        int wantW=requested.framebufferWidth(),wantH=requested.framebufferHeight();
        if(wantW>0){
            if(fw==wantW&&fh==wantH){resizePhase="applied";attempted=true;}
            else if(!attempted){
                if(iconified)resizePhase="deferred_iconified";
                else if(mc.getWindow().isFullscreen())resizePhase="unsupported_fullscreen";
                else if(dw[0]>0&&dh[0]>0&&ww[0]>0&&wh[0]>0){
                    try{GLFW.glfwSetWindowSize(handle,WindowPolicy.logicalSize(wantW,ww[0],dw[0]),WindowPolicy.logicalSize(wantH,wh[0],dh[0]));
                        attempted=true;resizeStarted=now;resizePhase="requested";
                    }catch(Exception failure){attempted=true;resizePhase="failed";error="native_resize_failed";}
                }
            }else if(resizePhase.equals("applied"))resizePhase="changed_externally";
            else if(resizeStarted>0&&now-resizeStarted>5000&&resizePhase.equals("requested")){resizePhase="failed";error="framebuffer_size_not_observed";}
        }else resizePhase="unchanged";
        if(output==null||now-lastWrite<1000)return;lastWrite=now;
        var data=new LinkedHashMap<String,Object>();data.put("schema","mcvisual.native-window/v1");data.put("recordedAt",Instant.now().toString());
        data.put("instanceId",INSTANCE);data.put("processId",ProcessHandle.current().pid());data.put("enabled",true);
        data.put("freeCursor",STARTUP.freeCursor());data.put("renderUnfocused",STARTUP.renderUnfocused());data.put("avoidFocusOnShow",STARTUP.avoidFocusOnShow());
        data.put("focused",focused);data.put("iconified",iconified);data.put("fullscreen",mc.getWindow().isFullscreen());
        data.put("mouseGrabbed",mc.mouseHandler.isMouseGrabbed());data.put("cursorMode",GLFW.glfwGetInputMode(handle,GLFW.GLFW_CURSOR));data.put("suppressedGrabRequests",grabSuppressed);
        data.put("framebufferWidth",fw);data.put("framebufferHeight",fh);data.put("windowWidth",ww[0]);data.put("windowHeight",wh[0]);
        data.put("drawableWidth",dw[0]);data.put("drawableHeight",dh[0]);
        data.put("requestedFramebufferWidth",wantW);data.put("requestedFramebufferHeight",wantH);data.put("resizePhase",resizePhase);
        data.put("frameCount",frames);data.put("frameAt",frameAt);data.put("worldFrameCount",worldFrames);data.put("worldFrameAt",worldFrameAt);
        data.put("worldPresent",mc.level!=null);data.put("fps",mc.getFps());data.put("frameLimit",mc.getWindow().getFramerateLimit());
        data.put("restartRequired",restartRequired);data.put("error",error);data.put("revision",Objects.toString(requested.revision(),""));
        try{Files.createDirectories(output.getParent());var tmp=output.resolveSibling(output.getFileName()+".tmp");Files.writeString(tmp,JSON.toJson(data));Files.move(tmp,output,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
        catch(Exception ignored){}
    }
}
