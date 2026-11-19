package org.mcvisual.neoforge;

import java.util.ArrayList;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import org.mcvisual.observer.InventoryTravelPolicy;
import org.mcvisual.observer.TargetInventory;

/** Native read-only view of the followed player's equipment and carried items. */
public final class ReadOnlyInventoryScreen extends Screen {
    private static final int PANEL_WIDTH = 212, PANEL_HEIGHT = 201;
    private final Object scope;
    private int window;
    String status;
    private final InventoryTravelPolicy travel;
    private final PreviewContents contents = new PreviewContents();
    private int lastMouseX = Integer.MIN_VALUE, lastMouseY = Integer.MIN_VALUE;

    private static long now() { return System.nanoTime() / 1_000_000; }

    ReadOnlyInventoryScreen(Object scope, int window, String status) {
        this(scope, window, status, null);
    }

    ReadOnlyInventoryScreen(Object scope, int window, String status, InventoryTravelPolicy inherited) {
        super(Component.literal("观战背包 · 只读"));
        this.scope = scope;
        this.window = window;
        this.status = status;
        this.travel = inherited != null ? inherited : new InventoryTravelPolicy(now(), InventoryTravelPolicy.IDLE_PREVIEW_MS);
    }

    InventoryTravelPolicy preview(Object expected) { return Objects.equals(scope, expected) ? travel : null; }

    boolean adopt(Object expected, int id) {
        if (!Objects.equals(scope, expected)) return false;
        window = id;
        status = "服务器背包 · 只读";
        return true;
    }

    private static ItemStack inventorySlot(TargetInventory.View<ItemStack> view, int index) {
        if (view == null || index >= view.slots().size()) return null;
        var slot = view.slots().get(index);
        return slot.known() ? slot.item() : null;
    }

    void checkScope() {
        var mc = Minecraft.getInstance();
        if (mc.screen != this) return;
        if (!Objects.equals(scope, NativeSpectatorSync.scope())) { mc.setScreen(null); return; }
        var actor = NativeSpectatorSync.target();
        long time = now();
        if (actor != null) {
            var shown = new ArrayList<ItemStack>(42);
            var view = NativeSpectatorSync.inventory();
            for (int slot = 0; slot < 36; slot++) shown.add(inventorySlot(view, slot));
            shown.addAll(SpectatorEquipmentPanel.stacks(actor));
            if (contents.update(shown)) travel.contentChanged(time);
        }
        if (travel.expired(time) || actor != null && travel.observe(time, actor.getX(), actor.getZ(), true)) onClose();
    }

    @Override public boolean isPauseScreen() { return false; }
    @Override public void removed() { NativeSpectatorSync.close(scope, window); }

    @Override public boolean keyPressed(int key, int scan, int mods) {
        if (key == 80) { travel.togglePin(now()); return true; }
        if (Minecraft.getInstance().options.keyInventory.matches(key, scan)) { onClose(); return true; }
        return super.keyPressed(key, scan, mods);
    }

    @Override public void render(GuiGraphics draw, int mx, int my, float delta) {
        var mc = Minecraft.getInstance();
        if (!Objects.equals(scope, NativeSpectatorSync.scope())) { mc.setScreen(null); return; }
        int x = (width - PANEL_WIDTH) / 2, y = (height - PANEL_HEIGHT) / 2;
        if (mx >= x && mx < x + PANEL_WIDTH && my >= y && my < y + PANEL_HEIGHT &&
            lastMouseX != Integer.MIN_VALUE && (Math.abs(mx - lastMouseX) > 1 || Math.abs(my - lastMouseY) > 1)) travel.interaction(now());
        lastMouseX = mx; lastMouseY = my;
        renderBackground(draw, mx, my, delta);
        draw.fill(x - 1, y - 1, x + PANEL_WIDTH + 1, y + PANEL_HEIGHT + 1, 0xff101820);
        draw.fill(x, y, x + PANEL_WIDTH, y + PANEL_HEIGHT, 0xffccd0d4);
        var actor = NativeSpectatorSync.target();
        String label = actor == null ? title.getString() : actor.getName().getString() + " · 背包只读";
        draw.drawString(font, font.plainSubstrByWidth(label, 196), x + 8, y + 7, 0xff20252b, false);
        var view = NativeSpectatorSync.inventory();
        String sync = view == null ? "等待库存同步" : view.full() ? "36 格库存已同步" : "快捷栏已同步，其余等待回执";
        draw.drawString(font, sync, x + 8, y + 21, 0xff405061, false);
        ItemStack equipment = SpectatorEquipmentPanel.draw(draw, font, SpectatorEquipmentPanel.stacks(actor), x + 10, y + 35, 6, mx, my);
        ItemStack hovered = equipment;
        for (int row = 0; row < 4; row++) for (int col = 0; col < 9; col++) {
            int index = row == 3 ? col : 9 + row * 9 + col;
            int px = x + 17 + col * 20, py = y + 72 + row * 20 + (row == 3 ? 5 : 0);
            draw.fill(px - 1, py - 1, px + 18, py + 18, 0xff68717a);
            draw.fill(px, py, px + 17, py + 17, 0xff9fa7af);
            var stack = inventorySlot(view, index);
            if (stack == null) { draw.drawString(font, "?", px + 5, py + 4, 0xff414b55, false); continue; }
            draw.renderItem(stack, px, py);
            draw.renderItemDecorations(font, stack, px, py);
            if (!stack.isEmpty() && mx >= px && mx < px + 18 && my >= py && my < py + 18) hovered = stack;
        }
        String description = equipment == null ? status : equipment.getHoverName().getString() +
            (equipment.isDamageableItem() ? " · 耐久 " + (equipment.getMaxDamage() - equipment.getDamageValue()) + "/" + equipment.getMaxDamage() : "");
        draw.drawString(font, font.plainSubstrByWidth(description, 196), x + 8, y + 161, 0xff405061, false);
        draw.drawString(font, travel.pinned() ? "已固定 · P 取消固定" : "15 秒无变化收起 · P 固定", x + 8, y + 175, 0xff405061, false);
        draw.drawString(font, "E / Esc 关闭", x + 8, y + 188, 0xff405061, false);
        var cursor = NativeSpectatorSync.cursor();
        if (!cursor.isEmpty()) {
            draw.renderItem(cursor, x + 187, y + 5);
            draw.renderItemDecorations(font, cursor, x + 187, y + 5);
        }
        if (hovered != null) draw.renderTooltip(font, hovered, mx, my);
    }
}
