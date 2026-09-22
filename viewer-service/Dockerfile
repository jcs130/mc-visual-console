# Linux 侧 viewer 服务：prismarine-viewer 的服务端要原生 node-canvas，
# 配方照千灯纪的 world/runtime-images/Dockerfile.world（cairo / pango / rsvg 那一套）。
# 画面（prismarine-viewer）与协议（本仓库）都跑在这一个容器里。
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git pkg-config ca-certificates \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      libxi-dev libxext-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用层缓存）；canvas 在这里编译，Linux 下不需要 Windows 工具链
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV VIEWER_PORT=7800 \
    PROTOCOL_PORT=7801 \
    MC_HOST=host.docker.internal \
    MC_PORT=25702 \
    MC_USERNAME=ag_xiaozhi \
    MC_VERSION=1.21.1 \
    VIEW_DISTANCE=6 \
    FIRST_PERSON=0

EXPOSE 7800 7801

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PROTOCOL_PORT||7801)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
