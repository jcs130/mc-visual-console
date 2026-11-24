// SPDX-License-Identifier: GPL-3.0-only
package org.mcvisual.neoforge.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import org.mcvisual.neoforge.NativeSpectatorHands;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;

/** Change only Iris's display gate for the verified target; never changes either player's game mode. */
@Pseudo
@Mixin(targets="net.irisshaders.iris.pathways.HandRenderer",remap=false)
public abstract class IrisSpectatorHandMixin {
 @ModifyExpressionValue(method="canRender",at=@At(value="INVOKE",target="Lnet/minecraft/client/multiplayer/MultiPlayerGameMode;getPlayerMode()Lnet/minecraft/world/level/GameType;"),remap=false)
 private GameType mcvisual$targetHandGate(GameType original){return original==GameType.SPECTATOR&&NativeSpectatorHands.renderReady()?GameType.SURVIVAL:original;}
 @ModifyExpressionValue(method="isHandTranslucent",at=@At(value="INVOKE",target="Lnet/minecraft/client/player/LocalPlayer;getItemBySlot(Lnet/minecraft/world/entity/EquipmentSlot;)Lnet/minecraft/world/item/ItemStack;"),remap=false)
 private ItemStack mcvisual$targetMaterial(ItemStack original,@Local(argsOnly=true)InteractionHand hand){var target=NativeSpectatorHands.renderReady()?NativeSpectatorHands.target():null;return target==null?original:target.getItemInHand(hand);}
}
