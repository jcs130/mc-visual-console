package org.mcvisual.neoforge;

import java.util.List;
import net.minecraft.world.item.ItemStack;

/** Compares displayed slots, including counts and components. Null is an unknown slot. */
final class PreviewContents {
    private ItemStack[] last;

    boolean update(List<ItemStack> current) {
        boolean first = last == null;
        boolean different = first || last.length != current.size();
        if (different) last = new ItemStack[current.size()];
        for (int i = 0; i < last.length; i++) {
            ItemStack next = current.get(i), previous = last[i];
            if (previous == null ? next == null : next != null && ItemStack.matches(previous, next)) continue;
            last[i] = next == null ? null : next.copy();
            different = true;
        }
        return !first && different;
    }
}
