FROM node:20-alpine AS builder
# Add necessary build tools for native dependencies
RUN apk add --no-cache python3 make g++ 

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
# Strip devDependencies so the runtime image only carries production deps
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 5000
CMD ["npm", "run", "start"]
