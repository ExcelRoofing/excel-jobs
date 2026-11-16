FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
ENV DATA_DIR=/data
ENV HOST=0.0.0.0
ENV PORT=8787
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/index.js"]
