package org.mcvisual.observer;
import java.util.*;
/** A missing native ADD is a visible source gap, never a fabricated bar. */
public final class BossBarState {
    private final Set<UUID> missing=new LinkedHashSet<>();
    private long uninitializedUpdates;
    public boolean accept(UUID id,boolean createOrRemove,boolean nativePresent) {
        if(createOrRemove||nativePresent){missing.remove(id);return true;}
        uninitializedUpdates++;
        if(missing.size()<64)missing.add(id);
        return false;
    }
    public void clear(){missing.clear();}
    public int missing(){return missing.size();}
    public long uninitializedUpdates(){return uninitializedUpdates;}
}
