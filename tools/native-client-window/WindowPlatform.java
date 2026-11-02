package org.mcvisual.window;
import java.nio.file.Path;

/** Original-client bindings. Window policy owns no Agent, director, connection or input. */
public interface WindowPlatform {
    record Snapshot(long handle,boolean fullscreen,boolean mouseGrabbed,boolean worldPresent,
                    boolean connected,int framebufferWidth,int framebufferHeight,int fps,
                    int optionFrameLimit,int appliedFrameLimit) {}
    Path gameDirectory();
    String loader();
    Snapshot snapshot();
    void disablePauseOnLostFocus();
    void frameLimit(int cap);
    Class<?>[] hookTargets();
}
