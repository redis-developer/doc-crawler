/**
 * @fileoverview Client-side tests of the API
 */

'use strict';
const axios = require('axios');
const appUrl = 'http://localhost:8000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    let res;

    console.log('*** app status ***');
    res = await axios({
        method: 'GET',
        url: appUrl,
        responseType: 'json'
    });
    console.log(JSON.stringify(res.data, null, 4));

    console.log('\n*** start a crawl task ***');
    res = await axios({
        method: 'POST',
        url: `${appUrl}/crawl`,
        data: {'fqdn': 'developer.redis.com'},
        responseType: 'json'
    });
    let taskID = res.data.taskID;
    console.log(JSON.stringify(res.data, null, 4));

    console.log('\n*** check status on the crawl task ***');
    let status;
    while (status != 'complete') {
        await sleep(10000);  //sleep 10 sec
        try {
            res = await axios({
                method: 'GET',
                url: `${appUrl}/status/tasks/${taskID}`,
                responseType: 'json'
            });
            status = res.data.status;
            console.log(JSON.stringify(res.data, null, 4));
        }
        catch (err) {
            console.log(err.message);
        }
    }

    console.log('\n*** document search ***');
    res = await axios({
        method: 'PUT',
        url: `${appUrl}/search`,
        data: {'term': 'Node.js'},
        responseType: 'json'
    });
    console.log(JSON.stringify(res.data, null, 4));
})();