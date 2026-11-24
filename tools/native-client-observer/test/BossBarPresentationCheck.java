import org.mcvisual.observer.BossBarPresentation;
import java.util.*;
public class BossBarPresentationCheck {
    static int checks;
    static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    static BossBarPresentation.Bar bar(String name,float progress){return new BossBarPresentation.Bar(UUID.randomUUID(),name,progress,"PURPLE","PROGRESS");}
    public static void main(String[] args){
        var rows=new ArrayList<BossBarPresentation.Bar>();for(int i=0;i<5;i++)rows.add(bar("Same guardian",0));
        var live=bar("Activity",.1f);rows.add(live);var before=List.copyOf(rows);var view=BossBarPresentation.compact(rows,2);
        check(view.total()==6&&view.empty()==5&&view.collapsed()==5,"actual live reproduction: six unique events, five empty");
        check(view.visible().equals(List.of(live.id())),"active event visible behind empty entries");
        check(rows.equals(before)&&view.details().equals(before),"no event deletion or semantic name dedupe");
        rows.set(0,new BossBarPresentation.Bar(rows.getFirst().id(),"Same guardian",.9f,"PURPLE","PROGRESS"));
        view=BossBarPresentation.compact(rows,2);check(view.visible().contains(rows.getFirst().id()),"subsequent native progress restores the original UUID");
        for(int i=0;i<140;i++)rows.add(bar("Guardian",1));view=BossBarPresentation.compact(rows,99);
        check(view.visible().size()==3&&view.details().size()==128&&view.detailsTruncated(),"bounded view and explicit detail truncation");
        check(view.total()==146&&rows.size()==146,"source events never capped or mutated");
        check(BossBarPresentation.compact(List.of(),2).collapsed()==0,"reset empty");
        System.out.println("BossBar presentation checks: "+checks);
    }
}
