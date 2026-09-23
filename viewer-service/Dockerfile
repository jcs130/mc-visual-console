# Linux 侧 viewer 服务：prismarine-viewer 的服务端要原生 node-canvas，
# 配方照千灯纪的 world/runtime-images/Dockerfile.world（cairo / pango / rsvg 那一套）。
# 画面与协议都跑在这一个容器里。
#
# ⚠️ 构建上下文 = **仓库根**（不是 viewer-service/）：
#    server.mjs 要 import ../packages/modern-viewer/，控制台页要 ../client/，
#    而 packages/modern-viewer/src 的依赖锚点是 ../../../viewer-service（见该文件注释）。
#    所以镜像里保持与仓库相同的相对布局，运行期那些相对路径才成立。
#    调用方式见仓库根 compose：build: { context: ., dockerfile: viewer-service/Dockerfile }
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git pkg-config ca-certificates \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      libxi-dev libxext-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依赖装在 viewer-service/ 下（与仓库布局一致 ⇒ 画面层的 deps-anchor 能找到它们）
COPY viewer-service/package.json viewer-service/
RUN cd viewer-service && npm install --omit=dev

# 组件页（client/）与画面层（packages/modern-viewer/，含派生资产 —— 镜像里必须有，否则画不出来）
COPY client/ client/
COPY packages/modern-viewer/ packages/modern-viewer/
COPY viewer-service/ viewer-service/

# 控制台页要的构建产物：必须是先在宿主机跑过 pnpm build:client 的（它不入库）
RUN test -f client/app.js || (echo 'ERROR: client/app.js missing — run `corepack pnpm build:client` before docker build' >&2 && exit 1)

# 容器内必须绑 0.0.0.0，否则 compose 发布的端口进不来；对外的暴露面由 compose 的端口绑定决定
# （默认只绑 127.0.0.1，见仓库根 docker-compose.yml）。
ENV VIEWER_PORT=7800 \
    PROTOCOL_PORT=7801 \
    PROTOCOL_HOST=0.0.0.0 \
    MC_VIEWER_HOST=0.0.0.0 \
    MC_HOST=host.docker.internal \
    MC_PORT=25702 \
    MC_USERNAME=ag_xiaozhi \
    MC_VERSION=1.21.1 \
    MC_GATE_TRANSLATED=1 \
    MC_MODERN_VIEWER=1 \
    VIEW_DISTANCE=6 \
    FIRST_PERSON=0

EXPOSE 7800 7801

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PROTOCOL_PORT||7801)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "viewer-service/server.mjs"]
