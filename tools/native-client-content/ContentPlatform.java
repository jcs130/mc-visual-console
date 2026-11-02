package org.mcvisual.content;

import java.nio.file.Path;

/** Loader bindings only. The shared stream never holds or controls a Minecraft client. */
public interface ContentPlatform {
    record Scene(Object world,Object connection,Object camera,String server,String recipientUuid,
                 String subjectUuid,int entityId,String dimension,String subjectName) {
        public boolean connected(){return world!=null&&connection!=null&&camera!=null
            &&server!=null&&recipientUuid!=null&&subjectUuid!=null&&dimension!=null;}
    }
    interface Canvas {
        int width();
        int height();
        String fit(String text,int width);
        void fill(int left,int top,int right,int bottom,int color);
        void text(String text,int x,int y,int color);
    }
    Path gameDirectory();
    Scene scene();
    boolean hidden();
}
