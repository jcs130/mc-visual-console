package org.mcvisual.director;

/** Two thresholds and dwell prevent a tight camera from flickering between first and third person. */
public final class CloseView {
    private boolean active,first;
    private long last=-1,blockedAt=-1,clearAt=-1,enteredAt=-1,recoveredAt=-1;
    private String reason="disabled";
    public void begin(){active=true;first=false;last=-1;blockedAt=-1;clearAt=-1;enteredAt=-1;recoveredAt=-1;reason="third_person";}
    public void stop(){active=false;first=false;reason="stopped";}
    public boolean update(long now,double distance,boolean known){
        if(!active)return false;
        if(now<last||!Double.isFinite(distance)||distance<0){stop();reason="invalid_sample";return false;}
        last=now;
        if(!known||distance<1.25){
            clearAt=-1;if(blockedAt<0)blockedAt=now;
            if(!first&&(!known||distance<.45||now-blockedAt>=350)){first=true;enteredAt=now;reason=known?"boom_too_close":"boom_space_unavailable";}
        }else{
            blockedAt=-1;
            if(first&&distance>=2.5){
                if(clearAt<0)clearAt=now;
                if(now-enteredAt>=3000&&now-clearAt>=2000){first=false;clearAt=-1;recoveredAt=now;reason="space_recovered";}
            }else clearAt=-1;
        }
        return first;
    }
    public boolean firstPerson(){return active&&first;}
    public double recovery(long now){if(recoveredAt<0)return 1;double t=Math.max(0,Math.min(1,(now-recoveredAt)/700.0));return t*t*(3-2*t);}
    public String reason(){return reason;}
}
