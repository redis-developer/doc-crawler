/**
 * @fileoverview Express-based API server
 */

'use strict';
const redis = require('redis');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Worker } = require('worker_threads');
const port = process.env.APP_PORT || 8000;
const redisUrl = process.env.REDIS_URL || 'http://localhost:6379';
var client;

/**
 * Helper function for creating redis client
 * @returns {redis} client
 */
async function clientFactory() {
    console.log(`app - clientFactory`);
    try {
        client.ping();
    }
    catch (err) {
        console.error(`app - clientFactory - ${err.message}`); 
        client = redis.createClient({url: redisUrl});
        client.on('error', (err) => {
            console.error(`app - clientFactory - ${err.message}`);
            throw new Error(err.message);
        });  
        await client.connect();
    }
    finally {
        return client;
    }
}

/**
 * Helper function for building the search index on the crawled docs
 */
async function buildIndex() {
    console.log(`app - buildIndex`);
    let rc = await clientFactory();
    try {
        await rc.ft.create('docIdx', {
            '$.doc': {
                type: redis.SchemaFieldTypes.TEXT,
                AS: 'doc'
            },
            '$.text': {
                type: redis.SchemaFieldTypes.TEXT,
                AS: 'text'
            }   
        }, {
            ON: 'JSON',
            PREFIX: 'DOC'
        });
    }
    catch(err) { 
        console.error(`app - buildIndex - ${err.message}`); 
    }
}

const app = express();
app.use(express.json());

/**
 * App status endpoint  
 */
app.get('/', (req, res) => {
    console.log(`app - GET /`);
    res.status(200).json({'status': 'app running'});
});

/**
 * Crawl endpoint.  Starts a Worker thread (spider.js) that crawls the given fqdn, extracts text via Tika,
 * and then store the resulting text in Redis as JSON documents
 * This returns immediately and provides a taskID for the Worker thread. 
 */
app.post('/crawl', (req, res) => {
    console.log(`app - POST /crawl ${req.body.fqdn}`);
    const taskID = uuidv4();
    try {
        new Worker('./app/spider.js', { workerData : { 'fqdn': req.body.fqdn, 'taskID': taskID }});
        res.status(201).json({'taskID': taskID});
    }
    catch (err) {
        console.error(`app - POST /crawl ${req.body.fqdn} - ${err.message}`)
        res.status(400).json({ 'error': err.message });
    }
});

/**
 * Task status endpoint.  Worker threads are assigned a taskID and that ID + Worker status is stored
 * in Redis as a JSON doc.  The client can poll this endpoint to determine when a crawl task is complete.
 */
app.get('/status/tasks/:taskID', async (req, res) => {
    console.log(`app - GET /status/tasks/${req.params.taskID}`)
    try {
        let rc = await clientFactory();
        const status = await rc.json.get(`taskID:${req.params.taskID}`, '.');
        if (status) {
            res.status(200).json(status);
        }
        else {
            throw new Error(`Task ${req.params.taskID} not found`);
        }
    }
    catch (err) {
        console.error(`app - GET /status/tasks/${req.params.taskID} - ${err.message}`)
        res.status(400).json({ 'error': err.message });
    }
});

/**
 * Doc search endpoint.  This exposes a very simple interface for searching crawled documents.  The client can
 * submit a term and an array of matching doc URLs are returned.
 */
app.put('/search', async (req, res) => {
    console.log(`app - PUT /search ${req.body.term}`)
    try {
        let rc = await clientFactory();
        const sres = await rc.ft.search('docIdx', `@text:${req.body.term}`, { RETURN: ['doc'] });
        if (sres && sres.documents) {
            let found = [];
            for (let item of sres.documents) {
                found.push(item.value.doc);
            }
            res.status(201).json({'docs': found});
        }
        else {
            throw new Error(`Query error ${req.body.term}`);
        }
    }
    catch (err) {
        res.status(400).json({ 'error': err.message });
    }
});

app.listen(port, async () => {
    await buildIndex();
    console.log(`app - listening on port ${port}`)
});