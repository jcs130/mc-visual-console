package org.mcvisual.window;

/** Explicit visual-client policy. Unconfigured game bodies retain vanilla behavior. */
public final class WindowPolicy {
    public static final String SCHEMA="mcvisual.window-policy/v1";
    public record Config(String schema,boolean enabled,boolean freeCursor,boolean renderUnfocused,
        boolean avoidFocusOnShow,int backgroundFps,int framebufferWidth,int framebufferHeight,String revision) {}
    public static Config disabled(){return new Config(SCHEMA,false,false,false,false,60,0,0,"");}
    public static boolean valid(Config c){return c!=null&&SCHEMA.equals(c.schema())
        &&(c.backgroundFps()==0||c.backgroundFps()>=10&&c.backgroundFps()<=240)
        &&validSize(c.framebufferWidth(),c.framebufferHeight());}
    public static boolean validSize(int w,int h){return w==0&&h==0||w>=320&&h>=240&&w<=4096&&h<=4096&&(long)w*h<=8_294_400;}
    public static boolean suppressGrab(Config c){return c!=null&&c.enabled()&&c.freeCursor();}
    public static boolean avoidFocus(Config c){return c!=null&&c.enabled()&&c.avoidFocusOnShow();}
    public static int frameLimit(Config c,int stock,boolean focused,boolean iconified,boolean world){
        return c!=null&&c.enabled()&&c.renderUnfocused()&&!focused&&!iconified&&world
            ?(c.backgroundFps()==0?60:c.backgroundFps()):stock;
    }
    public static boolean sameStartupPolicy(Config a,Config b){return a.enabled()==b.enabled()&&a.freeCursor()==b.freeCursor()
        &&a.renderUnfocused()==b.renderUnfocused()&&a.avoidFocusOnShow()==b.avoidFocusOnShow();}
    public static int logicalSize(int physical,int logical,int framebuffer){
        if(physical<1||logical<1||framebuffer<1)throw new IllegalArgumentException("window_size_unavailable");
        long result=Math.round(physical*(double)logical/framebuffer);
        if(result<1||result>8192)throw new IllegalArgumentException("window_scale_unavailable");
        return (int)result;
    }
}
