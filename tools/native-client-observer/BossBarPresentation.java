package org.mcvisual.observer;
import java.util.*;
/** Presentation only. An empty progress value is not proof of death or permission to REMOVE a UUID. */
public final class BossBarPresentation {
    public record Bar(UUID id,String name,float progress,String color,String overlay) {}
    public record View(List<UUID> visible,int total,int collapsed,int empty,List<Bar> details,boolean detailsTruncated) {}
    public static View compact(List<Bar> original,int maximum){
        int limit=Math.max(1,Math.min(3,maximum)),empty=0;var visible=new ArrayList<UUID>();
        for(var b:original){if(Float.isFinite(b.progress())&&b.progress()<=0)empty++;
            else if(visible.size()<limit)visible.add(b.id());}
        return new View(List.copyOf(visible),original.size(),original.size()-visible.size(),empty,
            List.copyOf(original.subList(0,Math.min(128,original.size()))),original.size()>128);
    }
}
