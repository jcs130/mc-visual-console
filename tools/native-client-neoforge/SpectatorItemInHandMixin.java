// SPDX-License-Identifier: GPL-3.0-only
// Adapted from hpfxd/SpectatorPlus ddc5aec185a59bfa8ecb6c12793a3262da6ee0d5.
// Original rendering hooks retained; native scope and frame guards are local-only.
package org.mcvisual.neoforge.mixin;

import org.mcvisual.neoforge.NativeSpectatorHands;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ItemInHandRenderer.class)
public abstract class SpectatorItemInHandMixin {
    @Shadow @Final private Minecraft minecraft;
    @Shadow private float mainHandHeight;
    @Shadow private float oMainHandHeight;
    @Shadow private float oOffHandHeight;
    @Shadow private float offHandHeight;
    @Shadow private ItemStack mainHandItem;
    @Shadow private ItemStack offHandItem;

    @Unique private AbstractClientPlayer spectated;

    @Inject(at = @At("HEAD"), method = "tick", cancellable = true)
    public void spectatorplus$fixSpectatorHandHeight(CallbackInfo ci) {
        final AbstractClientPlayer spectated = NativeSpectatorHands.target();
        if (spectated != null) {
            ci.cancel();
            NativeSpectatorHands.tickTarget(spectated);

            this.oMainHandHeight = this.mainHandHeight;
            this.oOffHandHeight = this.offHandHeight;

            final ItemStack mainHandItem = spectated.getMainHandItem();
            final ItemStack offHandItem = spectated.getOffhandItem();

            if (ItemStack.matches(this.mainHandItem, mainHandItem)) {
                this.mainHandItem = mainHandItem;
            }

            if (ItemStack.matches(this.offHandItem, offHandItem)) {
                this.offHandItem = offHandItem;
            }

            if (this.spectated == spectated) {
                float f = spectated.getAttackStrengthScale(1.0F);
                this.mainHandHeight += Mth.clamp((this.mainHandItem == mainHandItem ? f * f * f : 0.0F) - this.mainHandHeight, -0.4F, 0.4F);
                this.offHandHeight += Mth.clamp((float) (this.offHandItem == offHandItem ? 1 : 0) - this.offHandHeight, -0.4F, 0.4F);

                if (this.mainHandHeight < 0.1F) {
                    this.mainHandItem = mainHandItem;
                }

                if (this.offHandHeight < 0.1F) {
                    this.offHandItem = offHandItem;
                }
            } else {
                // this is the first tick of spectating a new player

                this.spectated = spectated;
                this.mainHandHeight = 1F;
                this.offHandHeight = 1F;
                this.mainHandItem = mainHandItem;
                this.offHandItem = offHandItem;
            }
        } else {
            this.spectated = null;
            NativeSpectatorHands.tickTarget(null);
        }
    }

    @ModifyVariable(method = "renderPlayerArm(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IFFLnet/minecraft/world/entity/HumanoidArm;)V", at = @At("STORE"))
    private AbstractClientPlayer setArmPlayer(AbstractClientPlayer in) {
        // render the arm as the camera entity, instead of always as the client player

        final AbstractClientPlayer spectated = NativeSpectatorHands.target();
        if (spectated != null) {
            return spectated;
        }

        return in;
    }

    @Redirect(
            method = "renderMapHand(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/HumanoidArm;)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/EntityRenderDispatcher;getRenderer(Lnet/minecraft/world/entity/Entity;)Lnet/minecraft/client/renderer/entity/EntityRenderer;")
    )
    private <T extends Entity> EntityRenderer<? super T> spectatorplus$mapHandUseCameraEntityRenderer(EntityRenderDispatcher instance, T entity) {
        final AbstractClientPlayer target = NativeSpectatorHands.target();
        return instance.getRenderer(target == null ? entity : (T) target);
    }

    @Redirect(
            method = "renderMapHand(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/HumanoidArm;)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/player/PlayerRenderer;renderRightHand(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/client/player/AbstractClientPlayer;)V")
    )
    private void spectatorplus$mapHandFixRightHand(PlayerRenderer instance, PoseStack poseStack, MultiBufferSource buffer, int combinedLight, AbstractClientPlayer player) {
        instance.renderRightHand(poseStack, buffer, combinedLight, NativeSpectatorHands.target() == null ? player : NativeSpectatorHands.target());
    }

    @Redirect(
            method = "renderMapHand(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/HumanoidArm;)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/player/PlayerRenderer;renderLeftHand(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/client/player/AbstractClientPlayer;)V")
    )
    private void spectatorplus$mapHandFixLeftHand(PlayerRenderer instance, PoseStack poseStack, MultiBufferSource buffer, int combinedLight, AbstractClientPlayer player) {
        final AbstractClientPlayer target = NativeSpectatorHands.target();
        instance.renderLeftHand(poseStack, buffer, combinedLight, target == null ? player : target);
    }

    @Redirect(method = {
            "renderOneHandedMap(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IFLnet/minecraft/world/entity/HumanoidArm;FLnet/minecraft/world/item/ItemStack;)V",
            "renderTwoHandedMap(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IFFF)V",
            "renderArmWithItem(Lnet/minecraft/client/player/AbstractClientPlayer;FFLnet/minecraft/world/InteractionHand;FLnet/minecraft/world/item/ItemStack;FLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V"
    }, at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;isInvisible()Z"))
    private boolean spectatorplus$spectatedInvisibility(LocalPlayer instance) {
        final AbstractClientPlayer target = NativeSpectatorHands.target();
        return target == null ? instance.isInvisible() : target.isInvisible();
    }
}

