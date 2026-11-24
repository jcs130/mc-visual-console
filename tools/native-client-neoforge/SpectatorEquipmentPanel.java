package org.mcvisual.neoforge;

import java.util.List;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/** The remote player's replicated equipment is independent of the 36-slot backpack packet. */
public final class SpectatorEquipmentPanel {
    private record Cell(String label, EquipmentSlot slot) {}
    private static final List<Cell> CELLS = List.of(
        new Cell("头盔", EquipmentSlot.HEAD), new Cell("胸甲", EquipmentSlot.CHEST),
        new Cell("护腿", EquipmentSlot.LEGS), new Cell("靴子", EquipmentSlot.FEET),
        new Cell("主手", EquipmentSlot.MAINHAND), new Cell("副手", EquipmentSlot.OFFHAND));
    static final int CELL_WIDTH = 32, CELL_HEIGHT = 30;

    public record Rail(int x, int y, int columns) {
        public boolean contains(int mx, int my) {
            return mx >= x && mx < x + columns * CELL_WIDTH && my >= y && my < y + 6 / columns * CELL_HEIGHT;
        }
    }

    public static Rail beside(int width, int height, int left, int top, int menuWidth, int menuHeight) {
        for (int columns : new int[]{2, 1}) {
            int w = columns * CELL_WIDTH, h = 6 / columns * CELL_HEIGHT;
            if (height < h + 4) continue;
            int y = Math.clamp(top, 2, height - h - 2);
            if (left + menuWidth + 4 + w <= width) return new Rail(left + menuWidth + 4, y, columns);
            if (left >= w + 4) return new Rail(left - w - 4, y, columns);
        }
        if (width < 6 * CELL_WIDTH) return null;
        int x = (width - 6 * CELL_WIDTH) / 2;
        if (top + menuHeight + 4 + CELL_HEIGHT <= height) return new Rail(x, top + menuHeight + 4, 6);
        if (top >= CELL_HEIGHT + 14) return new Rail(x, top - CELL_HEIGHT - 14, 6);
        return null;
    }

    public static List<ItemStack> stacks(AbstractClientPlayer actor) {
        return CELLS.stream().map(cell -> actor == null ? null : actor.getItemBySlot(cell.slot())).toList();
    }

    /** Hit boxes are the same for the backpack row and the container side rail. */
    public static ItemStack draw(GuiGraphics gfx, Font font, List<ItemStack> stacks, int x, int y, int columns, int mx, int my) {
        ItemStack hovered = null;
        for (int i = 0; i < CELLS.size(); i++) {
            int left = x + (i % columns) * CELL_WIDTH, top = y + (i / columns) * CELL_HEIGHT;
            gfx.fill(left, top, left + CELL_WIDTH - 1, top + CELL_HEIGHT - 1, 0xff333c48);
            gfx.drawCenteredString(font, CELLS.get(i).label(), left + 15, top + 1, 0xfff1f4f6);
            ItemStack stack = stacks.get(i);
            if (stack == null || stack.isEmpty()) {
                gfx.drawCenteredString(font, stack == null ? "?" : "空", left + 15, top + 14, 0xffc0cbd4);
            } else {
                gfx.renderItem(stack, left + 7, top + 12);
                gfx.renderItemDecorations(font, stack, left + 7, top + 12);
                if (mx >= left && mx < left + CELL_WIDTH && my >= top && my < top + CELL_HEIGHT) hovered = stack;
            }
        }
        return hovered;
    }
}
