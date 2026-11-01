package org.mcvisual.neoforge;
import java.io.ByteArrayInputStream;import java.io.IOException;import java.util.UUID;
import net.minecraft.nbt.*;import net.minecraft.network.RegistryFriendlyByteBuf;import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;import net.minecraft.resources.ResourceLocation;import net.minecraft.world.item.ItemStack;
import org.agentmc.platform.ClientRuntime.*;import org.mcvisual.observer.NativeObserverClient;
/** SpectatorPlus 1.2.1 wire format. Original full NBT uses the actual connection registry.
 * UUID/epoch validation and delta reconciliation remain in the shared TargetInventory policy.
 */
public final class SpectatorInventoryProtocol {
 private record Items(UUID playerId,ItemStack[] items,CustomPacketPayload.Type<Items> type)implements CustomPacketPayload{}
 public static void initialize(){
  for(boolean full:new boolean[]{false,true}){
   var type=new CustomPacketPayload.Type<Items>(ResourceLocation.parse(full?"spectatorplus:inventory_sync":"spectatorplus:hotbar_sync"));
   PayloadTypeRegistry.playS2C().register(type,new StreamCodec<RegistryFriendlyByteBuf,Items>(){
    public Items decode(RegistryFriendlyByteBuf buf){
     if(buf.readableBytes()>1_048_576)throw new IllegalArgumentException("Inventory payload budget exceeded");
     UUID id=buf.readUUID();int count=buf.readInt();if(count!=(full?36:9))throw new IllegalArgumentException("Invalid inventory slot count");
     ItemStack[] items=new ItemStack[count];for(int i=0;i<count;i++)if(buf.readBoolean()){
      int bytes=buf.readInt();if(bytes<0||bytes>131_072||bytes>buf.readableBytes())throw new IllegalArgumentException("Invalid original item length");
      if(bytes==0){items[i]=ItemStack.EMPTY;continue;}byte[] data=new byte[bytes];buf.readBytes(data);
      try{items[i]=ItemStack.parseOptional(buf.registryAccess(),NbtIo.readCompressed(new ByteArrayInputStream(data),NbtAccounter.create(1_048_576)));}
      catch(IOException invalid){throw new IllegalArgumentException("Invalid original item NBT",invalid);}
     }
     if(buf.isReadable())throw new IllegalArgumentException("Trailing inventory bytes");return new Items(id,items,type);
    }
    public void encode(RegistryFriendlyByteBuf buf,Items data){throw new UnsupportedOperationException("Read only");}
   });
   ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->{
    ClientPlayNetworking.registerReceiver(type,(data,context)->NativeObserverClient.targetInventory(data.playerId,data.items,full));
   });
  }
 }
}
