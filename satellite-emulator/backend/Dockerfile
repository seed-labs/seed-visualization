FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends iproute2
COPY start.sh /
RUN chmod +x /start.sh
WORKDIR /usr/src/app/backend
COPY . .
RUN npm install
RUN ./node_modules/.bin/tsc
ENTRYPOINT ["sh", "/start.sh"]