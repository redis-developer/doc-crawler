FROM node:lts-slim
COPY package*.json .
RUN npm install
COPY /app /app
EXPOSE 8000
CMD ["npm", "start"]