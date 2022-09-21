/**
 * @fileoverview Implements a web crawler that extracts text (html, pdf, etc) via Apache Tika and then
 * stores that text as JSON docs in Redis.  This file is executed in a Node.js Worker thread.
 */

'use strict';
const cheerio = require('cheerio');
const axios = require('axios');
const redis = require('redis');
const crypto = require('crypto');
const tikaUrl = process.env.TIKA_URL || 'http://localhost:9998';
const redisUrl = process.env.REDIS_URL || 'http://localhost:6379'

const { workerData } = require('worker_threads');
const { Readable } = require('stream');

const PREFIX = 'DOC';
const CRAWL_BUDGET = 2500;  // max number of iterations (recursions) for a given fqdn
const ERR_BUDGET = 100;  // max number of errors tolerated for a given fqdn

/**
 * @class Implements a very simple/naive web crawler
 */
class Spider {
    /**
     * 
     * @param {string} fqdn Domain to be crawled
     * @param {object} client Redis client
     */
    constructor(fqdn, client) {
        this.fqdn = fqdn;
        this.start = Date.now();
        this.docs = [];
        this.client = client; 
        this.errors = 0;
        this.indexed = 0;
        this.iterations = 0;
    }

    /**
     * 
     * @param {string} doc Current document being extracted and stored
     * @returns 
     */
    async crawl(doc=this.fqdn) {
        try {
            this.iterations++;
            if (this.errors < ERR_BUDGET && 
                this.iterations < CRAWL_BUDGET && 
                !this.docs.includes(doc)) 
            {
                console.log(`spider - crawled doc: ${doc}`)
                const response = await axios({  //fetch the doc as an array buffer
                    method: 'GET',
                    url: `https://${doc}`,
                    responseType: 'arrayBuffer'
                });
                const data = response.data;
                this.docs.push(doc);  // update visited pages

                // determine if document is already indexed
                const hash = crypto.createHash('sha256').update(data).digest('hex');
                let result = await this.client.json.get(`${PREFIX}:${doc}`, '.');  //attempt to fetch doc from Redis
                if (!result || result.hash != hash) {  //doc is not in Redis or a non-current version is in Redis
                    await this.extract(doc, data, hash);  //extract text via Tika and store in Redis
                    this.indexed++;
                } 
                
                // crawl links on document
                const $ = cheerio.load(data);
                const links = $('a');
                for (let link of links) {
                    link = $(link).attr('href');
                    if (link) {  //recurse on any valid links on page
                        link = link.replace(/[^a-z0-9]$/,'');  //remove any trailing char
                        if (link.startsWith(`https://${this.fqdn}`)) {  //case 1 - absolute link
                            await this.crawl(link.replace(/(^\w+:|^)\/\//, '')); //strip protocol
                        }
                        else if (link.startsWith('/')) {  //case 2 - root link
                                link = this.fqdn + link;
                                await this.crawl(link);
                        }
                        else if (link.length > 0 &&  //case 3 - relative link
                                !link.toLowerCase().startsWith('http') && 
                                !link.toLowerCase().startsWith('mailto')) { 
                                    link = `${doc}/${link}`;
                                    await this.crawl(link);
                        }
                        else {  //case 4 - not a valid link to crawl (link to foreign domain, etc)
                            continue;
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('spider - ' + err.message);
            this.errors++;
        } 
        finally {
            return {
                "indexed": this.indexed,
                "errors": this.errors,
                "time": parseFloat(((Date.now() - this.start)/1000).toFixed(2))
            }
        }
    }

    /**
     * 
     * @param {string} doc URL of document
     * @param {arrayBuffer} data Unformatted text of document
     * @param {string} hash SHA256 hash of the original document (prior to extraction to text)
     */
    async extract(doc, data, hash) {
        const stream = Readable.from(data);  //get a stream from the arrayBuffer obj
        const response = await axios({  //send that stream to Tika for automatic mime-type detection and text extraction
            method: 'PUT',
            url: `${tikaUrl}/tika`,
            data: stream,
            responseType: 'text',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Accept': 'text/plain'
            }
        });
        const json = { "doc": doc, "text": response.data, "hash": hash };
        await this.client.json.set(`${PREFIX}:${doc}`, '.', json);
    }
}

(async () => {
    console.log(`spider - job started ${workerData.fqdn}`)
    const client = redis.createClient({url: redisUrl});
    await client.connect();
    await client.json.set(`taskID:${workerData.taskID}`, '.', {'status': 'active'});
    const spider = new Spider(workerData.fqdn, client);
    let result = await spider.crawl();
    result['status'] = 'complete';
    await client.json.set(`taskID:${workerData.taskID}`, '.', result);
    await client.expire(`taskID:${workerData.taskID}`, 60*60*24);  //24 hour expiration
    await client.quit();
    console.log(`spider - ${workerData.fqdn} complete. docs indexed:${result.indexed},\
     errors:${result.errors}, time:${result.time}`);
})();