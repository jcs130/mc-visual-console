package org.mcvisual.observer;

import java.util.*;

/** UUID-bearing target packets only. Null entries mean unchanged, never empty. */
public final class TargetInventory<T> {
    public record Slot<T>(int index,T item,boolean known) {}
    public record View<T>(List<Slot<T>> slots,boolean full,Long hotbarAgeMs,Long fullAgeMs) {}
    private ObserverState.Camera camera;
    private long epoch=-1,hotbarAt=-1,fullAt=-1;
    private final List<T> items=new ArrayList<>(Collections.nCopies(36,null));
    public void reconcile(ObserverState.Camera next,long nextEpoch) {
        if(epoch!=nextEpoch||!same(camera,next)) {
            Collections.fill(items,null);hotbarAt=-1;fullAt=-1;
        }
        camera=next;epoch=nextEpoch;
    }
    public boolean accept(ObserverState.Camera next,long nextEpoch,String subject,List<T> delta,boolean full,long now) {
        reconcile(next,nextEpoch);
        if(next==null||!next.observer()||subject==null||!subject.equalsIgnoreCase(next.player())
                ||delta==null||delta.size()!=(full?36:9)||now<0)return false;
        boolean changed=false;
        for(int i=0;i<delta.size();i++)if(delta.get(i)!=null){items.set(i,delta.get(i));changed=true;}
        if(changed){hotbarAt=now;if(full)fullAt=now;}
        return true;
    }
    public View<T> view(ObserverState.Snapshot snapshot,long now) {
        if(snapshot==null)return null;
        reconcile(snapshot.camera(),snapshot.epoch());
        if(camera==null||!camera.observer()||hotbarAt<0||now<hotbarAt||now-hotbarAt>ObserverState.STALE_NS)return null;
        boolean full=fullAt>=0&&now>=fullAt&&now-fullAt<=ObserverState.STALE_NS;
        List<Slot<T>> slots=new ArrayList<>();
        for(int i=0;i<(full?36:9);i++)slots.add(new Slot<>(i,items.get(i),items.get(i)!=null));
        return new View<>(List.copyOf(slots),full,(now-hotbarAt)/1_000_000,
                fullAt<0||now<fullAt?null:(now-fullAt)/1_000_000);
    }
    private static boolean same(ObserverState.Camera a,ObserverState.Camera b) {
        return a==b||a!=null&&b!=null&&a.world()==b.world()&&a.entity()==b.entity()
                &&a.observer()==b.observer()&&Objects.equals(a.recipient(),b.recipient())&&Objects.equals(a.player(),b.player());
    }
}
