FROM node:22-alpine AS build
WORKDIR /build
COPY package.json yarn.lock ./
COPY packages/dredd/package.json packages/dredd/
COPY packages/dredd-transactions/package.json packages/dredd-transactions/
RUN yarn install --frozen-lockfile
COPY packages/ packages/
RUN yarn workspace dredd build \
    && cp -rL node_modules/dredd-transactions node_modules/.dt-copy \
    && rm node_modules/dredd-transactions \
    && mv node_modules/.dt-copy node_modules/dredd-transactions

FROM node:22-alpine
WORKDIR /app
# Hoisted deps first, then per-package deps overlaid on top
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/packages/dredd/node_modules ./node_modules
COPY --from=build /build/packages/dredd/bin ./bin
COPY --from=build /build/packages/dredd/build ./build
COPY --from=build /build/packages/dredd/options.json ./options.json
COPY --from=build /build/packages/dredd/package.json ./package.json
RUN ln -s /app/bin/dredd /usr/local/bin/dredd
CMD ["dredd"]
