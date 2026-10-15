// Legacy build hook; both transports use the same bounded history component.
globalThis.MinecraftViewerChat = installChatHistory({socket, document, window: globalThis});
