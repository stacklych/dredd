FROM node:22-alpine AS build
WORKDIR /build
COPY package.json yarn.lock ./
COPY packages/dredd/package.json packages/dredd/
COPY packages/dredd-transactions/package.json packages/dredd-transactions/
RUN yarn install --frozen-lockfile
COPY packages/ packages/
RUN yarn workspace @stacklych/dredd build

# Production dependencies only: the runtime image must not ship
# devDependencies (compilers, linters, test frameworks, test servers).
FROM node:22-alpine AS deps
WORKDIR /deps
COPY package.json yarn.lock ./
COPY packages/dredd/package.json packages/dredd/
COPY packages/dredd-transactions/ packages/dredd-transactions/
RUN yarn install --frozen-lockfile --production --ignore-scripts \
    && yarn cache clean \
    # Replace the workspace symlinks: copy dredd-transactions in, and drop
    # the link to packages/dredd (the runtime image is that package itself).
    && cp -rL node_modules/@stacklych/dredd-transactions node_modules/.dt-copy \
    && rm node_modules/@stacklych/dredd-transactions node_modules/@stacklych/dredd \
    && mv node_modules/.dt-copy node_modules/@stacklych/dredd-transactions \
    && mkdir -p packages/dredd/node_modules

FROM node:22-alpine
WORKDIR /app
# Hoisted deps first, then per-package deps overlaid on top
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=deps /deps/packages/dredd/node_modules ./node_modules
COPY --from=build /build/packages/dredd/bin ./bin
COPY --from=build /build/packages/dredd/build ./build
COPY --from=build /build/packages/dredd/options.json ./options.json
COPY --from=build /build/packages/dredd/package.json ./package.json
RUN ln -s /app/bin/dredd /usr/local/bin/dredd
# Run as the unprivileged user that the node image provides.
USER node
CMD ["dredd"]
