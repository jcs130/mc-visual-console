import org.mcvisual.observer.InventoryTravelPolicy;
public final class InventoryTravelPolicyCheck {
 static int n;static void check(boolean b){n++;if(!b)throw new AssertionError("check "+n);}
 public static void main(String[] args){
  var p=new InventoryTravelPolicy(0);check(!p.observe(0,0,0,true));check(!p.observe(5000,7,0,true));check(p.observe(6500,9,0,true));
  p=new InventoryTravelPolicy(0);for(int i=0;i<100;i++)check(!p.observe(i*1000,.01,0,true));
  p=new InventoryTravelPolicy(0);p.observe(0,0,0,true);p.togglePin(100);check(!p.observe(7000,9,0,true));p.togglePin(7100);check(!p.observe(9000,12,0,true));check(p.observe(12000,14,0,true));
  p=new InventoryTravelPolicy(0);p.observe(0,0,0,true);p.interaction(6000);check(!p.observe(7000,9,0,true));check(p.observe(11000,11,0,true));
  p=new InventoryTravelPolicy(0);p.observe(0,0,0,true);check(!p.observe(7000,1000,0,true));check(!p.observe(8000,1000,0,true));
  check(!p.observe(9000,1020,0,false));check(!p.observe(10000,1020,0,true));check(!p.observe(11000,Double.NaN,0,true));
  // A mirrored container at a stationary target must not cover the program forever.
  p=new InventoryTravelPolicy(0,15000);check(!p.observe(0,0,0,true));check(!p.observe(14999,0,0,true));check(p.observe(15000,0,0,true));
  // Actual content revisions and local inspection renew the preview, not mere redraws.
  p=new InventoryTravelPolicy(0,15000);p.observe(0,0,0,true);p.interaction(14000);check(!p.observe(15000,0,0,true));check(!p.observe(28999,0,0,true));check(p.observe(29000,0,0,true));
  p=new InventoryTravelPolicy(0,15000);p.observe(0,0,0,true);p.togglePin(1000);check(!p.observe(60000,0,0,true));p.togglePin(60001);check(!p.observe(60002,0,0,true));check(p.observe(75001,0,0,true));
  // Expiry cannot use invalid target evidence; scope loss is handled by the adapter.
  p=new InventoryTravelPolicy(0,15000);check(!p.observe(16000,0,0,false));check(!p.observe(16000,Double.NaN,0,true));check(p.observe(16000,0,0,true));
  p=new InventoryTravelPolicy(0,15000);p.observe(0,0,0,true);p.observe(5000,7,0,true);check(p.observe(6500,9,0,true));
  System.out.println("Inventory travel policy: "+n+" checks passed");
 }
}
