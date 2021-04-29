FROM node:14

WORKDIR /app
COPY package.json server.js wwdr.pem ./
RUN npm install

CMD npm start
