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
    public record Area(int x,int y,int width,int height) {}
    public record Border(int left,int top,int right,int bottom) {}
    public record Placement(int x,int y,int width,int height,boolean clamped) {}
    /** Fit a decorated client area into the monitor work area, preserving its aspect and a visible titlebar. */
    public static Placement fit(Area work,Border b,int x,int y,int width,int height){
        if(work.width()<1||work.height()<1||width<1||height<1||b.left()<0||b.top()<0||b.right()<0||b.bottom()<0)throw new IllegalArgumentException("invalid_window_geometry");
        int availableW=work.width()-b.left()-b.right(),availableH=work.height()-b.top()-b.bottom();
        if(availableW<1||availableH<1)throw new IllegalArgumentException("window_border_exceeds_work_area");
        double ratio=Math.min(1,Math.min(availableW/(double)width,availableH/(double)height));
        int w=Math.max(1,(int)Math.floor(width*ratio)),h=Math.max(1,(int)Math.floor(height*ratio));
        int minX=work.x()+b.left(),minY=work.y()+b.top();
        int maxX=work.x()+work.width()-b.right()-w,maxY=work.y()+work.height()-b.bottom()-h;
        boolean visible=x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
        return new Placement(visible?x:minX+(availableW-w)/2,visible?y:minY+(availableH-h)/2,w,h,ratio<1);
    }
    public static long overlap(Area a,Area b){return Math.max(0L,Math.min((long)a.x()+a.width(),(long)b.x()+b.width())-Math.max(a.x(),b.x()))
        *Math.max(0L,Math.min((long)a.y()+a.height(),(long)b.y()+b.height())-Math.max(a.y(),b.y()));}
}
