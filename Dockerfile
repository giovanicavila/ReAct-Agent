FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "--import", "tsx", "src/index.ts", "--server"]
