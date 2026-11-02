import org.mcvisual.observer.SpectatorDetails;
public final class SpectatorDetailsCheck {
 static int checks;static void ok(boolean value){checks++;if(!value)throw new AssertionError("spectator detail check "+checks);}
 public static void main(String[] args){
  var s=new SpectatorDetails();Object a="uuidA-world1-epoch1",b="uuidB-world1-epoch2";s.reconcile(a);
  ok(s.food(a,7,2));ok(s.food(a,true).level()==7);ok(s.food(a,false)==null);ok(!s.food(b,20,20));ok(!s.food(a,21,0));ok(!s.food(a,1,Float.NaN));
  ok(s.experience(a,.5f,40,12));ok(s.experience(a,true).level()==12);ok(s.experience(a,false)==null);ok(!s.experience(a,Float.POSITIVE_INFINITY,4,2));ok(!s.experience(a,0,-1,1));ok(!s.experience(a,0,1,-1));
  ok(s.selected(a,8));ok(s.selected(a,true)==8);ok(!s.selected(a,9));ok(s.selected(a,false)==null);
  ok(!s.screen(a,3,5));ok(s.request(a,100));ok(!s.request(a,110));ok(!s.request(a,90));ok(!s.request(b,3000));
  ok(s.screen(a,3,120));ok(!s.open(b,5,150));ok(s.open(a,5,150));ok(s.survival(a));ok(s.owns(a,5));ok(!s.open(a,6,151));ok(!s.owns(a,6));
  s.close(a);ok(!s.owns(a,5));ok(s.window(a)==-1);ok(s.request(a,2000));ok(!s.screen(a,3,8000));
  ok(s.screen(a,0,9000));ok(!s.open(a,7,12001));ok(s.screen(a,4,13000));ok(s.open(a,7,13001));ok(!s.survival(a));
  s.reconcile(b);ok(s.food(b,true)==null);ok(s.experience(b,true)==null);ok(s.selected(b,true)==null);ok(!s.owns(b,7));ok(!s.food(a,4,0));
  ok(s.food(b,0,0));s.reconcile(null);ok(s.food(b,true)==null);ok(!s.request(null,1));
  System.out.println("Spectator detail ownership: "+checks+" checks passed");
 }
}
