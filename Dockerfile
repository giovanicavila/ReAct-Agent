FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install && \
    bunx playwright install chromium && \
    bunx playwright install-deps chromium

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts", "--server"]
