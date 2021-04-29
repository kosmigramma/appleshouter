FROM node:14

WORKDIR /app
COPY package.json server.js ./
RUN npm install

CMD npm start
