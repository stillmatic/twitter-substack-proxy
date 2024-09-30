import express from 'express'
import { engine, create } from 'express-handlebars';
import crypto from 'crypto'
import { dirname } from 'path';
import path from 'path'
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom'
import { error } from 'console';
import fetch from 'node-fetch';
import * as urlSlug from 'url-slug'
import * as UrlUtil from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URLS_DIRECTORY = path.join(__dirname, '../public/articles/')
const expresshandlebars = create();

async function generatePage(url, manualRedirect = false) {
  const parsedUrl = UrlUtil.parse(url)
  parsedUrl.search = manualRedirect ? 'manualredirect' : ''
  const finalUrl = UrlUtil.format(parsedUrl)
  const hash = btoa(decodeURIComponent(url))
  const filepath = `${URLS_DIRECTORY}/${hash}.html`

  let htmlPage
  try {
    const articleRequest = await fetch(finalUrl);
    htmlPage = await articleRequest.text();
  } catch (e) {
    throw new Error(`Failed to fetch URL: ${e.message}`)
  }

  const dom = new JSDOM(htmlPage);
  function query(str) {
    return dom.window.document.querySelector(str).content
  }
  const title = query(`meta[property="og:title"]`) 
  const description = query(`meta[property="og:description"]`) 
  const image = query(`meta[name="twitter:image"]`) 

  const templateSource = fs.readFileSync('./views/article-card-template.handlebars', 'utf-8')
  const generatedtemplate = expresshandlebars.handlebars.compile(templateSource);
  fs.writeFileSync(filepath, generatedtemplate({ title, description, image, url: finalUrl, manualRedirect }), 'utf-8');

  return { title, description, image, url: finalUrl, manualRedirect };
}

async function run() {
  fs.mkdirSync(URLS_DIRECTORY, { recursive: true });
  const app = express();
  app.engine('handlebars', engine({
    helpers: {
      json: JSON.stringify
    }
  }));
  app.use(express.static('public'));
  app.set('view engine', 'handlebars');
  app.set('views', './views');
  app.use(express.json());

  app.get("/", async function (request, response) {
    response.render('index', { average:0 })
  });

  app.get("/generate-url/:url/:manualRedirect?", async function (request, response) {
    const url = request.params.url
    const manualRedirect = request.params.manualRedirect === 'true'
    const hash = btoa(decodeURIComponent(url))
    const filepath = `${URLS_DIRECTORY}/${hash}.html`

    if (fs.existsSync(filepath)) {
      response.json({ done: true, cached: true, hash  })
      return
    }

    try {
      await generatePage(url, manualRedirect);
      response.json({ done: true, hash })
    } catch (e) {
      response.json({ done: false, error: String(e)  })
    }
  });

  // 404 handler
  app.use(async function(req, res, next) {
    let path = req.path.slice(1); // Remove leading slash
  
    try {
      // if path begins with articles/ then remove it and remove .html from the end
      if (path.startsWith('articles/')) {
        path = path.slice(9);
        path = path.slice(0, -5);
      }
      const decodedUrl = atob(path);
      const pageData = await generatePage(decodedUrl);
      res.render('article-card-template', pageData);
    } catch (e) {
      console.log(e);
      res.status(404).send('Not found');
    }
  });

  const listener = app.listen(process.env.PORT, function () {
    console.log('Your app is listening on port ' + listener.address().port);
  });
}

run()