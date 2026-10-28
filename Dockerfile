FROM node:20-slim
WORKDIR /app

# No runtime dependencies - the server uses Node.js built-ins only.
COPY package.json ./
COPY server.js index.html holiday-photo-gallery.html pos-data.json ./
COPY assets ./assets

ENV NODE_ENV=production \
    PORT=8000 \
    DATA_DIR=/data

VOLUME /data
EXPOSE 8000
CMD ["node", "server.js"]
