package org.mcvisual.observer;
import java.util.Objects;
/** Passive values and read-only UI ownership. Identity is an opaque exact native scope. */
public final class SpectatorDetails {
 public record Food(int level,float saturation){}
 public record Experience(float progress,int needed,int level){}
 private Object scope;private Food food;private Experience experience;private Integer selected;
 private long requestedAt=-1,openDeadline=-1;private int window=-1,flags;private boolean pending,claimed;
 public void reconcile(Object next){if(!Objects.equals(scope,next)){scope=next;food=null;experience=null;selected=null;requestedAt=-1;openDeadline=-1;window=-1;flags=0;pending=false;claimed=false;}}
 public boolean food(Object expected,int value,float saturation){if(!matches(expected)||value<0||value>20||!Float.isFinite(saturation)||saturation<0||saturation>20)return false;food=new Food(value,saturation);return true;}
 public boolean experience(Object expected,float progress,int needed,int level){if(!matches(expected)||!Float.isFinite(progress)||progress<0||progress>1||needed<0||level<0)return false;experience=new Experience(progress,needed,level);return true;}
 public boolean selected(Object expected,int value){if(!matches(expected)||value<0||value>8)return false;selected=value;return true;}
 public Food food(Object expected,boolean fresh){return matches(expected)&&fresh?food:null;}
 public Experience experience(Object expected,boolean fresh){return matches(expected)&&fresh?experience:null;}
 public Integer selected(Object expected,boolean fresh){return matches(expected)&&fresh?selected:null;}
 private boolean matches(Object expected){return scope!=null&&Objects.equals(scope,expected);}
 public boolean request(Object expected,long now){if(!matches(expected)||now<0||requestedAt>=0&&(now<requestedAt||now-requestedAt<1000))return false;requestedAt=now;return true;}
 public boolean screen(Object expected,int value,long now){if(!matches(expected)||now<0||value<0||value>7)return false;if((value&2)!=0&&(requestedAt<0||now<requestedAt||now-requestedAt>5000))return false;flags=value;openDeadline=now+2000;pending=true;claimed=false;window=-1;return true;}
 public boolean open(Object expected,int id,long now){if(!matches(expected)||!pending||id<1||now<0||now>openDeadline)return false;pending=false;claimed=true;window=id;return true;}
 public boolean survival(Object expected){return matches(expected)&&claimed&&(flags&1)!=0;}
 public boolean owns(Object expected,int id){return matches(expected)&&claimed&&window==id;}
 public int window(Object expected){return matches(expected)&&claimed?window:-1;}
 public void close(Object expected){if(matches(expected)){claimed=false;pending=false;window=-1;}}
}
