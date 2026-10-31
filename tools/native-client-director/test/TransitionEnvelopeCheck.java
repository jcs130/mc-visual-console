import org.mcvisual.director.TransitionEnvelope;
public final class TransitionEnvelopeCheck {
    private static int checks;private static void check(boolean value,String reason){checks++;if(!value)throw new AssertionError(reason);}
    public static void main(String[] args){
        var envelope=new TransitionEnvelope();check(!envelope.active(),"disabled before explicit begin");
        envelope.begin("shot-1",1000,400,10000);check(envelope.alpha(1100)==1,"old frame is held before new native readiness");
        envelope.ready("other-shot",1100);check("holding".equals(envelope.phase()),"foreign request cannot release frame");
        envelope.ready("shot-1",1200);check(envelope.alpha(1200)==1,"blend starts at complete old-frame opacity");
        check(Math.abs(envelope.alpha(1400)-.5)<.0001,"midpoint is a real blend");
        check(envelope.alpha(1600)==0&&!envelope.active(),"transition ends without a persistent overlay");
        envelope.begin("shot-2",2000,400,1000);check(envelope.alpha(3001)==0&&"expired".equals(envelope.phase()),"unknown native outcome cannot freeze old video forever");
        envelope.begin("shot-3",4000,400,1000);check(envelope.alpha(3999)==0,"backwards time aborts");
        envelope.begin("shot-4",5000,400,1000);envelope.abort();envelope.ready("shot-4",5100);check(envelope.alpha(5200)==0,"late readiness cannot revive aborted transition");
        System.out.println(checks+" transition timing checks passed");
    }
}
