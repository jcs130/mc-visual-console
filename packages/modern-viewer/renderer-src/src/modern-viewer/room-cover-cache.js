import Chunks from "prismarine-chunk";
import MinecraftData from "minecraft-data";

const columnKey = (x, z) => `${Math.floor(x / 16) * 16},${Math.floor(z / 16) * 16}`;
const local = value => ((value % 16) + 16) % 16;

// Camera collision excludes leaves and glass. Roof visibility uses the streamed
// block shapes, retaining section palettes and decoding only queried sections.
export class RoomCoverCache {
  constructor(version) {
    this.Section = Chunks(version).section;
    const data = MinecraftData(version);
    this.coverStates = new Uint8Array(Math.max(...Object.keys(data.blocksByStateId).map(Number)) + 1);
    for (const [stateId, block] of Object.entries(data.blocksByStateId)) {
      this.coverStates[stateId] = block.boundingBox === "block" && block.name !== "water" && block.name !== "lava" ? 1 : 0;
    }
    this.columns = new Map();
    this.revision = 0;
  }

  ingestColumn(x, z, json) {
    const { minY, sections } = JSON.parse(json);
    this.columns.set(columnKey(x, z), { minY, sections, decoded: new Map() });
    this.revision++;
  }

  removeColumn(x, z) {
    if (this.columns.delete(columnKey(x, z))) this.revision++;
  }

  sectionAt(x, y, z) {
    const column = this.columns.get(columnKey(x, z));
    if (!column) return null;
    const index = Math.floor((y - column.minY) / 16);
    if (index < 0 || index >= column.sections.length || column.sections[index] == null) return null;
    if (!column.decoded.has(index)) column.decoded.set(index, this.Section.fromJson(column.sections[index]));
    return column.decoded.get(index);
  }

  isSolidBlock(x, y, z) {
    const section = this.sectionAt(x, y, z);
    return !!section && this.coverStates[section.get({ x: local(x), y: local(y), z: local(z) })] === 1;
  }

  setBlockStateId(x, y, z, stateId) {
    this.sectionAt(x, y, z)?.set({ x: local(x), y: local(y), z: local(z) }, stateId);
    this.revision++;
  }

  get diagnostics() {
    let decodedSections = 0;
    for (const column of this.columns.values()) decodedSections += column.decoded.size;
    return { columns: this.columns.size, decodedSections };
  }
}
