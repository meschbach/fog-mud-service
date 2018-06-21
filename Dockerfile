FROM node:10.4.1-alpine
ENV NDOE_ENV=production
RUN apk add --no-cache --virtual /tmp/.build-deps alpine-sdk python
WORKDIR /app
ADD *.js *.json /app/
RUN chown -R node:node /app
USER node
RUN npm install --production --silent

USER root
RUN apk remove apline-sdk python && apk del /tmp/.build-deps

USER node
EXPOSE 12345
CMD ["node", "cli.js", "omni"]
