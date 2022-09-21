# Example of a Web Crawler with Redis Indexing

## Summary
API server implementation of a web crawler.  Apache Tika is leveraged to extract text from crawled docs (html,
pdf, etc).  The extracted text is then stored in Redis as JSON and indexed via RediSearch.

## Architecture
### High Level
![High-level Architecture](https://docs.google.com/drawings/d/e/2PACX-1vTSA_ZdSLYGTVXzALpSndVo1cjt4z9XumZsoI5skRkILGlYOIudkIGEwR6iQ9wjlIgQ3CJ0CoGYILr1/pub?w=663&h=380 "High Level Architecture")
### Detailed
![Detailed Architecture](https://docs.google.com/drawings/d/e/2PACX-1vQjHys8uZsTIntbtubgaPOkrqXVaGmGtl57B_NAzbkzBn3GvT02MKSYwlsYqiLVKQVgq2WFdxGzzRnA/pub?w=830&h=290 "Detailed Architecture")
## Application Flow
![Application Flow](https://docs.google.com/drawings/d/e/2PACX-1vQUqCKdebUOvKqUa7POsdNxJsOLLhog13krnQZmwIxvECC-GTzo24mwl4YiNVWR_4_RjMY-D989O2A1/pub?w=696&h=292 "Application Flow")

## Features
- Implements a simple web crawler (cheerio-based)
- Utilizes Apache Tika server for mime-type detection and text extraction
- Utilizes RedisJSON for document storage and RediSearch for indexing.
## Prerequisites
- Docker
- Node.js
- npm
- Apache Tika
- Redis w/RediSearch and RedisJSON modules
## Installation
1. Clone this repo.

2. Go to doc-crawler folder.
```bash
cd doc-crawler
```
3. Install Node.js requirements
```bash
npm install
```
4. Build and start docker containers
```bash
docker compose up
```
## Usage
### Test Client
```bash
npm run test
```
### CURL
```bash
#app status
curl -X GET http://localhost:8000

{"status":"app running"}

#start a crawl task
curl -X POST http://localhost:8000/crawl \
-H 'Content-Type: application/json' \
-d '{"fqdn":"developer.redis.com"}'

{"taskID":"ec135f4c-d3f5-4a9f-bafb-4eb90bfd8273"}

#check status on a crawl task
curl -X GET http://localhost:8000/status/tasks/ec135f4c-d3f5-4a9f-bafb-4eb90bfd8273

{"status":"active"}

curl -X GET http://localhost:8000/status/tasks/ec135f4c-d3f5-4a9f-bafb-4eb90bfd8273

{"indexed":159,"errors":0,"time":56.81,"status":"complete"}

#document search
curl -X PUT http://localhost:8000/search \
-H 'Content-Type: application/json' \
-d '{"term":"Node.js"}'

{"docs":["developer.redis.com/develop/node","developer.redis.com/develop/node/node-crash-course","developer.redis.com/develop/java/redis-and-spring-course/lesson_8","developer.redis.com/develop/node/nodecrashcourse/runningtheapplication","developer.redis.com/develop/node/nodecrashcourse/welcome","developer.redis.com/develop/node/nodecrashcourse/coursewrapup","developer.redis.com/develop/node/nodecrashcourse/redisbloom","developer.redis.com/develop/node/nodecrashcourse/sessionstorage","developer.redis.com/develop/node/nodecrashcourse/checkinswithstreams","developer.redis.com/develop/node/nodecrashcourse/redisearch"]}
```