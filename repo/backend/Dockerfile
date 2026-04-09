FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/evidence-storage

EXPOSE 3020

CMD ["node", "src/index.js"]
