// SPDX-License-Identifier: GPL-3.0-only
// Adapted from hpfxd/SpectatorPlus ddc5aec185a59bfa8ecb6c12793a3262da6ee0d5.
// Original rendering hooks retained; native scope and frame guards are local-only.
package org.mcvisual.neoforge.mixin;

import com.google.common.base.MoreObjects;
import org.mcvisual.neoforge.NativeSpectatorHands;
import org.mcvisual.neoforge.SpectatorHandPolicy;
import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.RenderBuffers;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class SpectatorHandGameRendererMixin {
    @Shadow @Final Minecraft minecraft;
    @Shadow @Final private LightTexture lightTexture;
    @Shadow @Final private RenderBuffers renderBuffers;
    @Shadow @Final public ItemInHandRenderer itemInHandRenderer;

    @Unique private float bob;
    @Unique private float bobO;
    @Unique private float walkDist;
    @Unique private float walkDistO;

    @Unique private float xBob;
    @Unique private float yBob;
    @Unique private float xBobO;
    @Unique private float yBobO;

    @Inject(method = "renderItemInHand(Lnet/minecraft/client/Camera;FLorg/joml/Matrix4f;)V", at = @At(value = "INVOKE", target = "Lorg/joml/Matrix4fStack;popMatrix()Lorg/joml/Matrix4fStack;"))
    public void spectatorplus$renderItemInHand(Camera camera, float partialTicks, Matrix4f matrix4f, CallbackInfo ci, @Local PoseStack poseStackIn) {
        if (NativeSpectatorHands.renderReady() && this.minecraft.player != null && this.minecraft.options.getCameraType().isFirstPerson() && !this.minecraft.options.hideGui) {
            final AbstractClientPlayer spectated = NativeSpectatorHands.target();
            if (spectated != null && !spectated.isSpectator()) {
                this.lightTexture.turnOnLightLayer();
                try {

                float attackAnim = spectated.getAttackAnim(partialTicks);
                final InteractionHand interactionHand = MoreObjects.firstNonNull(spectated.swingingArm, InteractionHand.MAIN_HAND);
                float pitch = Mth.lerp(partialTicks, spectated.xRotO, spectated.getXRot());

                poseStackIn.mulPose(Axis.XP.rotationDegrees((spectated.getViewXRot(partialTicks) - Mth.lerp(partialTicks, this.xBobO, this.xBob)) * 0.1F));
                poseStackIn.mulPose(Axis.YP.rotationDegrees(Mth.degreesDifference(Mth.lerp(partialTicks, this.yBobO, this.yBob), Mth.rotLerp(partialTicks, spectated.yRotO, spectated.getYRot())) * 0.1F));

                final int handRenderSelection = evaluateWhichHandsToRender(spectated);
                final int packedLightCoords = this.minecraft.getEntityRenderDispatcher().getPackedLightCoords(spectated, partialTicks);

                final SpectatorHandRendererAccessor accessor = ((SpectatorHandRendererAccessor) this.itemInHandRenderer);

                if ((handRenderSelection & 1) != 0) {
                    final float swingProgress = interactionHand == InteractionHand.MAIN_HAND ? attackAnim : 0.0F;
                    final float equippedProgress = 1F - Mth.lerp(partialTicks, accessor.getOMainHandHeight(), accessor.getMainHandHeight());

                    accessor.invokeRenderArmWithItem(spectated, partialTicks,
                            pitch, InteractionHand.MAIN_HAND, swingProgress, accessor.getMainHandItem(), equippedProgress,
                            poseStackIn, this.renderBuffers.bufferSource(), packedLightCoords);
                }

                if ((handRenderSelection & 2) != 0) {
                    final float swingProgress = interactionHand == InteractionHand.OFF_HAND ? attackAnim : 0.0F;
                    final float equippedProgress = 1F - Mth.lerp(partialTicks, accessor.getOOffHandHeight(), accessor.getOffHandHeight());

                    accessor.invokeRenderArmWithItem(spectated, partialTicks,
                            pitch, InteractionHand.OFF_HAND, swingProgress, accessor.getOffHandItem(), equippedProgress,
                            poseStackIn, this.renderBuffers.bufferSource(), packedLightCoords);
                }

                NativeSpectatorHands.rendered(spectated, handRenderSelection, accessor.getMainHandItem(), accessor.getOffHandItem());
                } catch (RuntimeException failure) {
                    NativeSpectatorHands.failed(failure);
                } finally {
                    this.lightTexture.turnOffLightLayer();
                    this.renderBuffers.bufferSource().endBatch();
                }
            }
        }
    }

    @Unique
    private static int evaluateWhichHandsToRender(AbstractClientPlayer player) {
        return SpectatorHandPolicy.hands(player.getMainHandItem().is(Items.BOW) || player.getOffhandItem().is(Items.BOW)
            || player.getMainHandItem().is(Items.CROSSBOW) || player.getOffhandItem().is(Items.CROSSBOW),
            player.isUsingItem(), player.getUseItem().is(Items.BOW) || player.getUseItem().is(Items.CROSSBOW),
            player.getUsedItemHand() == InteractionHand.MAIN_HAND,
            SpectatorHandRendererAccessor.invokeIsChargedCrossbow(player.getMainHandItem()),
            SpectatorHandRendererAccessor.invokeIsChargedCrossbow(player.getOffhandItem()));
    }

    @Inject(method = "tick()V", at = @At("HEAD"))
    private void spectatorplus$tick(CallbackInfo ci) {
        final AbstractClientPlayer spectated = NativeSpectatorHands.target();
        if (spectated != null) {
            // View bobbing

            // get horizontal distance between current and last pos
            final Vec3 pos = spectated.position().with(Direction.Axis.Y, 0);
            final Vec3 posO = spectated.getPosition(0F).with(Direction.Axis.Y, 0);
            final float deltaMovement = (float) posO.distanceTo(pos);

            this.walkDistO = this.walkDist;
            this.walkDist += deltaMovement * 0.6F;

            this.bobO = this.bob;
            if (spectated.isPassenger() || !spectated.onGround() || spectated.isDeadOrDying() || spectated.isSwimming()) {
                this.bob = 0.0F;
            } else {
                this.bob += (Math.min(0.1F, deltaMovement) - this.bob) * 0.4F;
            }

            // Hand swaying

            this.yBobO = this.yBob;
            this.xBobO = this.xBob;
            this.xBob += Mth.degreesDifference(this.xBob, spectated.getXRot()) * 0.5F;
            this.yBob += Mth.degreesDifference(this.yBob, spectated.getYRot()) * 0.5F;
        } else {
            this.bob = this.bobO = this.walkDist = this.walkDistO = this.xBob = this.yBob = this.xBobO = this.yBobO = 0;
        }
    }

    @ModifyExpressionValue(method = "bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V", at = @At(value = "FIELD", target = "Lnet/minecraft/world/entity/player/Player;walkDist:F"))
    private float spectatorplus$modifyBobWalkDist(float original, @Local Player cameraPlayer) {
        return cameraPlayer == NativeSpectatorHands.target() ? this.walkDist : original;
    }

    @ModifyExpressionValue(method = "bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V", at = @At(value = "FIELD", target = "Lnet/minecraft/world/entity/player/Player;walkDistO:F"))
    private float spectatorplus$modifyBobWalkDistO(float original, @Local Player cameraPlayer) {
        return cameraPlayer == NativeSpectatorHands.target() ? this.walkDistO : original;
    }

    @ModifyExpressionValue(method = "bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V", at = @At(value = "FIELD", target = "Lnet/minecraft/world/entity/player/Player;bob:F"))
    private float spectatorplus$modifyBobValue(float original, @Local Player cameraPlayer) {
        return cameraPlayer == NativeSpectatorHands.target() ? this.bob : original;
    }

    @ModifyExpressionValue(method = "bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V", at = @At(value = "FIELD", target = "Lnet/minecraft/world/entity/player/Player;oBob:F"))
    private float spectatorplus$modifyBobValueO(float original, @Local Player cameraPlayer) {
        return cameraPlayer == NativeSpectatorHands.target() ? this.bobO : original;
    }

    @ModifyExpressionValue(method = "pick(F)V", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;blockInteractionRange()D"))
    private double spectatorplus$modifyBlockInteractionRange(double original) {
        final AbstractClientPlayer spectated = NativeSpectatorHands.target();
        if (spectated != null) {
            return spectated.blockInteractionRange();
        }

        return original;
    }

    @ModifyExpressionValue(method = "pick(F)V", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;entityInteractionRange()D"))
    private double spectatorplus$modifyEntityInteractionRange(double original) {
        final AbstractClientPlayer spectated = NativeSpectatorHands.target();
        if (spectated != null) {
            return spectated.entityInteractionRange();
        }

        return original;
    }
}

