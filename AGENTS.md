# Viewer fidelity requirements

- The user's My Agent World view must use the exact Minecraft/modpack textures and models. Never substitute vanilla blocks/entities or simplified geometry for missing mod content.
- Keep original namespaces, native state properties, model inheritance, UVs, resource-pack priority, animation metadata and dynamic model inputs. A translated Mineflayer proxy registry is not a rendering registry.
- Read rendering data from the action player's own connection. Do not create another account and call its inventory or UI the original player's state.
- Distinguish source-asset integrity, native network-state integrity and actual scene parity. Exporting resources or passing protocol tests is not proof of rendering parity.
- Create motion, custom NeoForge loaders, block-entity renderers and animated entities require actual runtime rendering support. Use a matched modded Java client as the reference; use native client rendering for a complete view if the browser implementation cannot reproduce it faithfully.
- Missing support is an explicit unavailable/error state. Do not quietly fall back to an approximate view. The native asset verifier's strict rendering check must remain closed until actual complete scene parity is accepted.
- Generated assets, client/mod JARs, world saves and private runtime captures stay outside Git. Keep the existing family server and its network ports untouched while developing in the isolated 1.21.1 lab.
