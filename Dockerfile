FROM node:12

WORKDIR /app
COPY package.json server.js ./
RUN npm install

CMD npm start
