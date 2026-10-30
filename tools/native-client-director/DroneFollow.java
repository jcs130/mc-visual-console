package org.mcvisual.director;

/** Small, frame-rate independent display rig. Does not move an entity or query a model. */
public final class DroneFollow {
    public record Pose(double x,double y,double z,float yaw,float pitch,boolean snapped) {}
    private String identity;
    private double ax,ay,az,cx,cy,cz,heading;
    private long previousNanos;
    public void reset(){identity=null;previousNanos=0;}
    private static double alpha(double dt,double seconds){return 1-Math.exp(-dt/seconds);}
    private static double angle(double value){return ((value+180)%360+360)%360-180;}
    private static boolean finite(double... v){for(double n:v)if(!Double.isFinite(n))return false;return true;}
    public Pose next(String id,double x,double y,double z,float bodyYaw,long nanos,double distance,double height){
        if(id==null||!finite(x,y,z,bodyYaw,distance,height)||distance<2||distance>10||height<0.5||height>5)
            throw new IllegalArgumentException("Invalid observed camera sample or explicit rig dimensions");
        double dt=previousNanos==0?0:(nanos-previousNanos)/1_000_000_000.0;
        double dx=x-ax,dy=y-ay,dz=z-az;
        boolean snap=!id.equals(identity)||dt<=0||dt>1||dx*dx+dy*dy+dz*dz>144;
        if(snap){identity=id;heading=bodyYaw;}
        else {
            // Follow actual horizontal travel; head micro-turns while standing still do not spin the camera.
            double speed=Math.hypot(dx,dz)/dt;
            if(speed>0.25){
                double desired=Math.toDegrees(Math.atan2(-dx,dz));
                double turn=angle(desired-heading)*alpha(dt,0.45);
                heading+=Math.max(-100*dt,Math.min(100*dt,turn));
            }
        }
        double radians=Math.toRadians(heading),tx=x+Math.sin(radians)*distance,
            ty=y+height,tz=z-Math.cos(radians)*distance;
        if(snap){cx=tx;cy=ty;cz=tz;}
        else {double a=alpha(dt,0.22);cx+=(tx-cx)*a;cy+=(ty-cy)*a;cz+=(tz-cz)*a;}
        ax=x;ay=y;az=z;previousNanos=nanos;
        double rx=x-cx,ry=y-cy,rz=z-cz;
        return new Pose(cx,cy,cz,(float)Math.toDegrees(Math.atan2(-rx,rz)),
            (float)-Math.toDegrees(Math.atan2(ry,Math.hypot(rx,rz))),snap);
    }
}
