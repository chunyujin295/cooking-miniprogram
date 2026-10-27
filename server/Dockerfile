# 使用本机已存在的镜像，避免拉取 node:20-alpine 卡在网络上
FROM m.daocloud.io/docker.io/library/node:22-alpine

# Prisma 引擎走国内镜像，避免 binaries.prisma.sh 下载卡住
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
