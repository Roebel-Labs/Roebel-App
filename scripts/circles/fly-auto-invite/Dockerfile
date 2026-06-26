FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY bot.mjs ./
# Long-running worker: bot.mjs loops internally every INTERVAL_SECONDS.
CMD ["node", "bot.mjs"]
