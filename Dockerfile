FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
