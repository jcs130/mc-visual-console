package org.mcvisual.director;

/** Pure timing; native readiness, rendering and resource ownership stay outside. */
public final class TransitionEnvelope {
    private String id,phase="idle";private long startedAt,readyAt;private int durationMs,maxHoldMs;
    public void begin(String id,long now,int durationMs,int maxHoldMs){
        if(id==null||!id.matches("[A-Za-z0-9:_-]{1,80}")||durationMs<100||durationMs>1500||maxHoldMs<1000||maxHoldMs>12000)throw new IllegalArgumentException("Invalid bounded transition");
        this.id=id;this.startedAt=now;this.readyAt=0;this.durationMs=durationMs;this.maxHoldMs=maxHoldMs;phase="holding";
    }
    public void ready(String requestId,long now){if("holding".equals(phase)&&id.equals(requestId)&&now>=startedAt){readyAt=now;phase="blending";}}
    public double alpha(long now){
        if(("holding".equals(phase)||"blending".equals(phase))&&(now<startedAt||now-startedAt>maxHoldMs+durationMs)){phase="expired";return 0;}
        if("holding".equals(phase)){if(now-startedAt>maxHoldMs){phase="expired";return 0;}return 1;}
        if(!"blending".equals(phase))return 0;
        double t=Math.max(0,Math.min(1,(now-readyAt)/(double)durationMs));
        if(t>=1){phase="complete";return 0;}return 1-t*t*(3-2*t);
    }
    public void abort(){phase="aborted";}
    public boolean active(){return "holding".equals(phase)||"blending".equals(phase);}
    public String phase(){return phase;} public String id(){return id;}
}
