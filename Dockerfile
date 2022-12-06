FROM node:16

WORKDIR /app

COPY package.json yarn.lock ./


RUN yarn config set registry https://registry.npm.taobao.org/

# install packages
RUN yarn

# copy source code
COPY . .

# prepare before start
## generate typechain
RUN yarn hardhat compile

# start server
CMD yarn hardhat run scripts/deploy.ts --network localhost && yarn start
