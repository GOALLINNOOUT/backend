// server/utils/syncPerfumesToElasticsearch.js
const mongoose = require('mongoose');
const Perfume = require('../models/Perfume');
const esClient = require('./elasticsearch');
require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI

async function syncPerfumes() {
  await mongoose.connect(MONGODB_URI);
  const perfumes = await Perfume.find();
  if (!perfumes.length) {
    console.log('No perfumes found in MongoDB.');
    return;
  }

  // Step 1: Get all MongoDB perfume IDs as strings
  const mongoIds = perfumes.map(doc => doc._id.toString());

  // Step 2: Get all Elasticsearch perfume IDs
  const esIds = [];
  let searchAfter = undefined;
  while (true) {
    const esResult = await esClient.search({
      index: 'perfumes',
      _source: false,
      size: 1000,
      body: {
        sort: [{ createdAt: 'asc' }],
        search_after: searchAfter ? [searchAfter] : undefined
      }
    }).catch(() => ({ hits: { hits: [] } }));
    const hits = esResult.body ? esResult.body.hits.hits : esResult.hits.hits;
    if (!hits.length) break;
    esIds.push(...hits.map(hit => hit._id));
    if (hits.length < 1000) break;
    // Use createdAt for searchAfter
    searchAfter = hits[hits.length - 1].sort[0];
  }

  // Step 3: Find IDs in Elasticsearch but not in MongoDB
  const idsToDelete = esIds.filter(id => !mongoIds.includes(id));
  if (idsToDelete.length) {
    const deleteBody = idsToDelete.flatMap(id => [
      { delete: { _index: 'perfumes', _id: id } }
    ]);
    const deleteResult = await esClient.bulk({ refresh: true, body: deleteBody });
    const deleteResponse = deleteResult.body || deleteResult;
    if (deleteResponse.errors) {
      console.error('Errors occurred during deletion:', JSON.stringify(deleteResponse, null, 2));
    } else {
      console.log(`Deleted ${idsToDelete.length} perfumes from Elasticsearch that are no longer in MongoDB.`);
    }
  }

  // Bulk index to Elasticsearch
  const body = perfumes.flatMap(doc => [
    { index: { _index: 'perfumes', _id: doc._id.toString() } },
    {
      name: doc.name,
      description: doc.description,
      price: doc.price,
      stock: doc.stock,
      images: doc.images,
      mainImageIndex: doc.mainImageIndex,
      promoEnabled: doc.promoEnabled,
      promoType: doc.promoType,
      promoValue: doc.promoValue,
      promoStart: doc.promoStart,
      promoEnd: doc.promoEnd,
      categories: doc.categories,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }
  ]);
  await esClient.indices.create({ index: 'perfumes' }, { ignore: [400] });
  const bulkResult = await esClient.bulk({ refresh: true, body });
  // For compatibility with different Elasticsearch client versions
  const bulkResponse = bulkResult.body || bulkResult;
  if (bulkResponse.errors) {
    console.error('Errors occurred during bulk indexing:', JSON.stringify(bulkResponse, null, 2));
  } else {
    console.log('Successfully indexed perfumes to Elasticsearch!');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  syncPerfumes().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
