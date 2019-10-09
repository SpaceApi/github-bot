FROM node:latest
ADD . .
EXPOSE 3000
RUN npm install
CMD ["npm", "start"]
