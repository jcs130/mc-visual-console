package org.mcvisual.voiceactivity;
import de.maxhenkel.voicechat.api.VoicechatClientApi;
import de.maxhenkel.voicechat.api.events.OpenALSoundEvent;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import org.lwjgl.openal.*;

/** Isolated software device: no speaker, microphone, game connection or WAV. */
public final class NativeOpenALReplay {
 static final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r);t.setDaemon(true);return t;});
 static boolean classify(int source,int model,short[] pcm,boolean disabled)throws Exception {
  AL10.alDistanceModel(model);
  VoiceActivityPlugin plugin=new VoiceActivityPlugin();
  Field enabled=VoiceActivityPlugin.class.getDeclaredField("enabled");enabled.setAccessible(true);enabled.set(plugin,true);
  Field sender=VoiceActivityPlugin.class.getDeclaredField("timer");sender.setAccessible(true);sender.set(plugin,timer);
  Field field=VoiceActivityPlugin.class.getDeclaredField("activity");field.setAccessible(true);ActivityWindow activity=(ActivityWindow)field.get(plugin);
  UUID id=UUID.randomUUID();activity.receive(id,pcm,System.currentTimeMillis());
  VoicechatClientApi api=(VoicechatClientApi)Proxy.newProxyInstance(NativeOpenALReplay.class.getClassLoader(),new Class[]{VoicechatClientApi.class},(o,m,a)->m.getName().equals("isDisabled")?disabled:m.getReturnType()==boolean.class?false:null);
  OpenALSoundEvent.Post event=(OpenALSoundEvent.Post)Proxy.newProxyInstance(NativeOpenALReplay.class.getClassLoader(),new Class[]{OpenALSoundEvent.Post.class},(o,m,a)->switch(m.getName()){case "getSource"->source;case "getChannelId"->id;case "getVoicechat"->api;case "isCancelled","isCancellable"->false;default->null;});
  Method rendered=VoiceActivityPlugin.class.getDeclaredMethod("rendered",OpenALSoundEvent.Post.class);rendered.setAccessible(true);rendered.invoke(plugin,event);
  return activity.remainingMs(System.currentTimeMillis())>0;
 }
 public static void main(String[]args)throws Exception {
  long device=SOFTLoopback.alcLoopbackOpenDeviceSOFT((CharSequence)null);if(device==0)throw new AssertionError("No loopback software device");
  ALCCapabilities caps=ALC.createCapabilities(device);
  long context=ALC10.alcCreateContext(device,new int[]{ALC10.ALC_FREQUENCY,48000,SOFTLoopback.ALC_FORMAT_CHANNELS_SOFT,SOFTLoopback.ALC_MONO_SOFT,SOFTLoopback.ALC_FORMAT_TYPE_SOFT,SOFTLoopback.ALC_SHORT_SOFT,0});
  if(context==0||!ALC10.alcMakeContextCurrent(context))throw new AssertionError("No software context");AL.createCapabilities(caps);
  int source=AL10.alGenSources(),buffer=AL10.alGenBuffers();short[] pcm=new short[9600];Arrays.fill(pcm,(short)4000);
  AL10.alBufferData(buffer,AL10.AL_FORMAT_MONO16,pcm,48000);AL10.alSourceQueueBuffers(source,buffer);
  AL10.alSource3f(source,AL10.AL_POSITION,0,0,2);AL10.alSourcef(source,AL10.AL_REFERENCE_DISTANCE,0);AL10.alSourcef(source,AL10.AL_MAX_DISTANCE,20);
  assert classify(source,AL11.AL_LINEAR_DISTANCE,pcm,false):"actual SVC AL_LINEAR_DISTANCE must gate";
  assert classify(source,AL11.AL_LINEAR_DISTANCE_CLAMPED,pcm,false):"clamped mode must also gate";
  assert classify(source,AL10.AL_NONE,pcm,false):"already mixed mode must gate";
  AL10.alSourcef(source,AL10.AL_GAIN,0);assert !classify(source,AL11.AL_LINEAR_DISTANCE,pcm,false):"muted voice must not gate";AL10.alSourcef(source,AL10.AL_GAIN,1);
  AL10.alSource3f(source,AL10.AL_POSITION,0,0,100);assert !classify(source,AL11.AL_LINEAR_DISTANCE,pcm,false):"distant voice must not gate";AL10.alSource3f(source,AL10.AL_POSITION,0,0,2);
  assert !classify(source,AL11.AL_LINEAR_DISTANCE,new short[9600],false):"silent PCM must not gate";
  assert !classify(source,AL11.AL_LINEAR_DISTANCE,pcm,true):"disabled receiver must not gate";
  AL10.alSourcePlay(source);SOFTLoopback.alcRenderSamplesSOFT(device,new short[19200],19200);
  assert !classify(source,AL11.AL_LINEAR_DISTANCE,pcm,false):"processed device queue must not gate";
  AL10.alDeleteSources(source);AL10.alDeleteBuffers(buffer);ALC10.alcMakeContextCurrent(0);ALC10.alcDestroyContext(context);ALC10.alcCloseDevice(device);timer.shutdownNow();
  System.out.println("8 real OpenAL software-device replay cases passed; no microphone, speaker or game connection");
 }
}
