FROM docker.io/library/node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/sim/package.json packages/sim/
COPY frontend/package.json frontend/
COPY verifier/package.json verifier/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/sim packages/sim
COPY verifier verifier
RUN npm run build --workspace @trust-issues/verifier

FROM docker.io/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8081
COPY --from=build /app/verifier/dist/main.js ./main.js
USER node
EXPOSE 8081
CMD ["node", "main.js"]
