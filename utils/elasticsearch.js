// server/utils/elasticsearch.js
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'https://localhost:9200',
  auth: {
    username: process.env.ELASTIC_NAME || 'elastic',
    password: process.env.ELASTIC_PASSWORD || ''
  },
  tls: {
    rejectUnauthorized: false // for self-signed certs in dev
  }
});

module.exports = client;
